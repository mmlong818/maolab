/* @agentia/auth-browser —— 云一登录 + AI 员工入场，浏览器半场。
 *
 * 本文件是构建产物（源码在 SDK 仓库 packages/browser/src/*.ts，产物矩阵与
 * 选型理由见同仓 packages/browser/README.md）。零运行时依赖
 * （SHA-256 兜底实现已构建期内联）。
 *
 * ⚠️ 本包**不碰任何敏感数据**。它只：
 *   - 读 /api/auth/config 的 authority + client_id（公开信息）拼授权跳转
 *   - 把授权码 POST 给本站后端，由后端持 client_secret 换 token
 *   - 持有本站签发的 opaque token（会话凭证，非上游凭证）
 * client_secret、云一 JWT、llmk_ key、agentiaToken 一律不经过这里。
 * （反例：dj-research-tool 用 `VITE_` 前缀的环境变量把 client_secret 打进了 bundle。
 *  这里刻意不写出那个变量名的完整拼写——本文件会被复制进接入方的前端静态目录，
 *  而 INTEGRATION.md 的泄露自查是拿 grep 找 `VITE_` 前缀加密钥后缀的组合，
 *  写全了会让每个接入方都收到一条假警报。假警报比没有警报更糟：
 *  狼来多了，真泄露也没人信。）
 *
 * 相比存量 9 份手写实现，本包统一补齐了它们各自缺失的部分：
 *   - isStandaloneReturn：独立站与平台嵌入同 origin 共享 localStorage，
 *     只看 mode 会误判（浏览器先在独立站登录过、平台再打开就串号）。
 *     必须用 token 值比对。存量仅 storybook 一家有。
 *   - stripTokenFromUrl：token 不留地址栏（防进历史/日志/被误分享）。
 *   - state 防 CSRF：chengge 那版没有。
 */
/* 存储键常量。token/mode 走 localStorage（跨会话），state/return/verifier 走
 * sessionStorage（一次登录流程内有效，见 gate.ts）。 */
const STORE_KEY = "agentia-auth-token";
const STATE_KEY = "agentia-oauth-state";
const RETURN_KEY = "agentia-oauth-return";
const PKCE_KEY = "agentia-oauth-verifier";

/* per-client 的共享可变状态。原单文件实现里这些是 createClient 闭包变量，
 * 拆模块后收进一个 ctx 对象，各模块**始终以 ctx.xxx 读写**（不许解构拷贝到
 * 局部——那会把"共享可变"变成"各持一份快照"，竞态防护全部失效）。 */
/** 组装完成前被调用即抛：这类调用只可能是 client.ts 的装配 bug，不是运行时问题。 */
function unwired(name) {
    throw new Error("[agentia-auth] 装配 bug：late." + name + " 在组装完成前被调用");
}
function createCtx(options) {
    const opts = options || {};
    const apiBase = (opts.apiBase || "").replace(/\/+$/, "");
    const storeKey = opts.storageKey || STORE_KEY;
    // modeKey 独立可配：迁移既有站点时两个 key 未必是派生关系（storybook 用的是
    // storybook-standalone-token / storybook-auth-mode）。沿用不上原 key，存量
    // 用户的登录态会静默丢失。
    const modeKey = opts.modeKey || storeKey + "-mode";
    // 未构建型项目没有 i18n，退化成原文
    const t = opts.t || function (k, fallback) { return fallback || k; };
    // 页面的 fetch 包装器可能 await 本模块返回的 Promise，用它会死锁 —— 必须原生 fetch
    const origFetch = opts.fetch || window.fetch.bind(window);
    /* 徽章失败自愈的退避是固定档位而非指数：这不是过载重试，是等上游那一下抖动
     * 过去，两三次拿不到就该老实显示失败，别一直给上游加压。 */
    const WALLET_RETRY_MS = (function () {
        const v = opts.walletRetryDelays;
        if (v === false || (Array.isArray(v) && !v.length))
            return []; // 显式关闭
        if (Array.isArray(v) && v.length)
            return v.slice(0, 5);
        return [3000, 8000];
    })();
    /* 充值到账后的重查档位，比上面那组快得多：这里等的不是"上游故障恢复"，
     * 而是 portal 把积分入账——通常一两秒内完成。 */
    const WALLET_SETTLE_MS = (function () {
        const v = opts.walletSettleDelays;
        if (v === false || (Array.isArray(v) && !v.length))
            return [];
        if (Array.isArray(v) && v.length)
            return v.slice(0, 6);
        return [800, 1500, 3000, 5000];
    })();
    /* 消耗侧自动刷新的**兜底**间隔。
     *
     * 主力是"活动驱动"（见 wallet-chip 的 startLive）：观察页面自己在打业务接口，
     * 有动静才刷 —— 页面静止时**一个请求都不发**。第一版做成固定 15 秒轮询，
     * 页面挂着没人动也在 4 次/分钟地打宿主接口，那就是纯空转。
     *
     * 兜底仍然要留，因为活动检测有两个盲区：
     *   1. 纯 SSE / WebSocket 驱动的工具 —— 进度经由长连接推送，不产生新的
     *      resource timing 条目；
     *   2. 余额在别处变化 —— 同一账户在另一个工具花钱、或在平台侧充值。
     * 间隔取得很长（默认 3 分钟），一小时也就 20 次打宿主接口、上游最多 20 次。
     */
    const WALLET_LIVE_MS = (function () {
        const v = opts.walletLiveMs;
        if (v === false || v === 0)
            return 0; // 关闭整个消耗侧自动刷新
        if (typeof v === "number" && Number.isFinite(v) && v > 0)
            return Math.max(3000, v);
        return 180000;
    })();
    /* 活动驱动刷新的最小间隔：一轮生成里业务请求是连续不断的，没有这个下限就会
     * 变成"每几秒刷一次"，等于换了个形式的轮询。 */
    const WALLET_ACTIVITY_GAP_MS = (function () {
        const v = opts.walletActivityMinGapMs;
        if (v === false || v === 0)
            return 0; // 只留兜底 interval
        if (typeof v === "number" && Number.isFinite(v) && v > 0)
            return Math.max(3000, v);
        return 20000;
    })();
    return {
        opts: opts,
        apiBase: apiBase,
        storeKey: storeKey,
        modeKey: modeKey,
        t: t,
        origFetch: origFetch,
        callbackPath: opts.callbackPath || "/callback",
        mintAnonAllowed: opts.mintAnonAllowed !== false,
        tokenTransport: opts.tokenTransport || "auto",
        queryAuthStuck: (opts.tokenTransport || "auto") === "query",
        cfgPromise: null,
        gateEl: null,
        sessionMode: "",
        payEl: null,
        pollTimer: null,
        walletSeq: 0,
        walletRetryTimer: null,
        WALLET_LIVE_MS: WALLET_LIVE_MS,
        WALLET_ACTIVITY_GAP_MS: WALLET_ACTIVITY_GAP_MS,
        WALLET_ACTIVITY_DEBOUNCE_MS: 2500,
        walletLiveTimer: null,
        walletActivityTimer: null,
        walletActivityLastAt: 0,
        walletLiveWired: false,
        walletActivityObserver: null,
        WALLET_RETRY_MS: WALLET_RETRY_MS,
        WALLET_SETTLE_MS: WALLET_SETTLE_MS,
        late: {
            mountWalletChip: function () { return unwired("mountWalletChip"); },
            doLogout: function () { return unwired("doLogout"); },
        },
        url: function (path) { return apiBase + path; },
    };
}

// ── 存储 ────────────────────────────────────────────────────────────────
function createStorage(ctx) {
    function getStored() {
        try {
            return localStorage.getItem(ctx.storeKey) || "";
        }
        catch (_a) {
            return "";
        }
    }
    function getMode() {
        try {
            return localStorage.getItem(ctx.modeKey) || "";
        }
        catch (_a) {
            return "";
        }
    }
    function setStored(tok, mode) {
        try {
            localStorage.setItem(ctx.storeKey, tok);
            localStorage.setItem(ctx.modeKey, mode);
        }
        catch (_a) { }
    }
    function clearStored() {
        try {
            localStorage.removeItem(ctx.storeKey);
            localStorage.removeItem(ctx.modeKey);
        }
        catch (_a) { }
    }
    /* URL 里的 token 是否是「本站自己存的」（登录回跳产生的）。
     * 区分两种「URL 带 token」：
     *   独立站态：URL token === localStorage 存的 → 走 bootstrap（挂徽章、401 回登录门）
     *   平台注入态：平台塞的，≠ 本站存的 → 旁路（不挂徽章、不换发）
     * 关键：不能只看 mode —— 同 origin 共享 localStorage，独立站登录过的残留
     * mode=yunyi 会让平台入口误判。必须比对 token 值。 */
    function isStandaloneReturn(urlToken) {
        return Boolean(urlToken) && urlToken === getStored();
    }
    /* 是否被嵌在 iframe 里。跨源时读 window.top 会抛 SecurityError——抛了就说明
     * 确实被跨源嵌套，同样算 iframe。 */
    function inIframe() {
        try {
            return window.self !== window.top;
        }
        catch (_a) {
            return true;
        }
    }
    /* ── 平台注入态的 token：存 sessionStorage，**按标签页隔离** ──────────────
     *
     * 为什么不是 URL：原实现把它留在地址栏（`?token=`），理由是"平台身份不该落
     * localStorage，否则换个用户从平台进来会串号，而地址栏是唯一载体"。代价是
     * **会话凭证长期暴露在 URL 上** —— 进浏览器历史、被截图、被用户手动分享，
     * 拿到就能冒充这个用户 7 天（TTL），包括花他的平台积分。
     *
     * 为什么不是 localStorage：那是按 origin 存的，同一浏览器里换个平台用户进来
     * 会读到上一个人的 token —— 就是当初否掉它的原因。
     *
     * sessionStorage 正好同时满足两个约束：
     *   · 按**标签页**隔离 —— 平台每次开的是新标签页，不同用户互不可见，不串号；
     *   · 刷新 / 站内导航保留 —— 解决"抹掉地址栏就丢身份"。
     *
     * ⚠️ 写不进去时（Safari 无痕、iframe 被 storage 策略拦、配额满）**必须回退**到
     * 老行为（token 留在地址栏），否则用户一刷新就掉登录态。所以 set 返回布尔，
     * 调用方据此决定要不要抹地址栏。宁可少一层安全收益，也不能弄丢身份。 */
    function portalKey() {
        return ctx.storeKey + "-portal";
    }
    function getPortalStored() {
        try {
            return sessionStorage.getItem(portalKey()) || "";
        }
        catch (_a) {
            return "";
        }
    }
    function setPortalStored(tok) {
        if (!tok)
            return false;
        try {
            sessionStorage.setItem(portalKey(), tok);
            // 写完立刻读回校验：某些环境 setItem 不抛错但也没真存（隐私模式的假 storage）。
            // 不校验的话我们会以为存好了、把地址栏抹掉，然后刷新就掉线。
            return sessionStorage.getItem(portalKey()) === tok;
        }
        catch (_a) {
            return false;
        }
    }
    function clearPortalStored() {
        try {
            sessionStorage.removeItem(portalKey());
        }
        catch (_a) { }
    }
    /* ── 「下一次登录必须重新认证」标记 ──────────────────────────────────────
     *
     * 解决的问题：只清本站登录态的话，提供方的会话 cookie 还在，用户点「登录」会被
     * **免密秒登**回同一个账号 —— 退出看起来没生效，也没法换账号。
     *
     * 原先靠 RP-Initiated Logout（跳 end_session_endpoint）真注销上游会话来解决。
     * 云一网关那边建议改用另一条路：退出时不碰上游，登录时带 `prompt=login` 强制
     * 重新认证（见 gate.ts 的 reauthQuery）。本标记就是这条路的触发器。
     *
     * 为什么**只在登出后**加、而不是每次登录都加：无条件加会把 SSO 的便利整个丢掉
     * —— 用户每次本站 token 过期都得重新输一遍凭证，即使他在网关那边明明还登着。
     *
     * ⚠️ 为什么是 localStorage 而不是 sessionStorage：sessionStorage 按标签页存，
     * 用户退出后**关掉标签页**、重新打开本站，标记就没了 —— 于是又被免密秒登回原
     * 账号，等于这个功能在最常见的一种用法下静默失效。「下次登录要重新认证」是
     * 设备级意图，不是标签页级的。
     *
     * ⚠️ 清除时机是**换到 token 成功之后**，不是发起 authorize 的时候。发起时就清
     * 的话，用户跳到网关又中途放弃（关页面 / 点返回），标记已经没了，下次进来照样
     * 免密秒登 —— 原 bug 复活，而且只在"放弃登录"这条路径上复活，最难发现。 */
    function reauthKey() {
        return ctx.storeKey + "-reauth";
    }
    function markForceReauth() {
        try {
            localStorage.setItem(reauthKey(), "1");
        }
        catch (_a) { }
    }
    function needsForceReauth() {
        try {
            return localStorage.getItem(reauthKey()) === "1";
        }
        catch (_a) {
            return false;
        }
    }
    function clearForceReauth() {
        try {
            localStorage.removeItem(reauthKey());
        }
        catch (_a) { }
    }
    /* ── 「本标签页已自动发起过一次 SSO」标记 ────────────────────────────────
     *
     * `?sso=` 静默登录入口的防循环闸（见 gate.ts 的 maybeAutoLogin）。
     * 用 sessionStorage 而非 localStorage：这是"这个标签页的这一轮尝试"，
     * 不是设备级意图 —— 换个标签页重新从宿主站点进来，理应再次自动登录。
     * 与 reauth 标记正好相反（那个是设备级的，见上面 markForceReauth 的说明）。 */
    function ssoKey() {
        return ctx.storeKey + "-sso-tried";
    }
    function markSsoTried() {
        try {
            sessionStorage.setItem(ssoKey(), "1");
        }
        catch (_a) { }
    }
    function ssoTriedOnce() {
        try {
            return sessionStorage.getItem(ssoKey()) === "1";
        }
        catch (_a) {
            return false;
        }
    }
    function clearSsoTried() {
        try {
            sessionStorage.removeItem(ssoKey());
        }
        catch (_a) { }
    }
    /* 从地址栏移除 token：身份只存 localStorage / sessionStorage，URL 不暴露 bearer 令牌。 */
    function stripTokenFromUrl() {
        try {
            const cur = new URL(window.location.href);
            if (cur.searchParams.has("token")) {
                cur.searchParams.delete("token");
                history.replaceState(null, "", cur.pathname + cur.search + cur.hash);
            }
        }
        catch (_a) { }
    }
    function setAuthToken(tok) {
        const bag = window.__AGENTIA_AUTH__ || {};
        bag.token = tok;
        window.__AGENTIA_AUTH__ = bag;
        const onToken = ctx.opts.onToken;
        if (typeof onToken === "function")
            onToken(tok);
    }
    function currentToken() {
        return getStored() || getPortalStored()
            || (window.__AGENTIA_AUTH__ && window.__AGENTIA_AUTH__.token) || "";
    }
    return {
        getStored: getStored,
        getMode: getMode,
        setStored: setStored,
        clearStored: clearStored,
        isStandaloneReturn: isStandaloneReturn,
        inIframe: inIframe,
        getPortalStored: getPortalStored,
        setPortalStored: setPortalStored,
        clearPortalStored: clearPortalStored,
        markForceReauth: markForceReauth,
        needsForceReauth: needsForceReauth,
        clearForceReauth: clearForceReauth,
        markSsoTried: markSsoTried,
        ssoTriedOnce: ssoTriedOnce,
        clearSsoTried: clearSsoTried,
        stripTokenFromUrl: stripTokenFromUrl,
        setAuthToken: setAuthToken,
        currentToken: currentToken,
    };
}

// ── 配置 ────────────────────────────────────────────────────────────────
function createConfig(ctx) {
    function fetchCfg() {
        if (!ctx.cfgPromise) {
            ctx.cfgPromise = ctx.origFetch(ctx.url("/api/auth/config"))
                .then(function (r) { return r.ok ? r.json() : null; })
                .catch(function () { return null; })
                .then(function (d) { return d && typeof d === "object" ? d : { enabled: false }; });
        }
        return ctx.cfgPromise;
    }
    return { fetchCfg: fetchCfg };
}

// ── 本站 token 的载体：Authorization 头 vs ?token= ──────────────────────
//
// 生产环境的 Kong 上挂着公司插件 nd-auth-restriction：**只要请求带
// `Authorization: Bearer <任意值>`，它就拿去按公司 SSO 验，验不过直接 403**，
// 且在到达应用之前就拦掉——后端日志里连这条请求都看不到。而本站签发的是自己的
// opaque token，永远过不了公司 SSO。
//
// 恶劣之处在于**只在生产复现**：dev 和本地直连没有 Kong，一切正常。表现是
// 「点了没反应、前端报错、服务端零记录」。storybook / shortstory-builder /
// skillforge 已各踩过一次——正因为它是环境相关的，配置项会被忘记，所以这里
// 默认走**自动降级**（撞到一次就整个实例切过去并记住，标记在 ctx.queryAuthStuck），
// 与服务端 billing.js 的策略一致。
//
// Kong 不碰 query 参数；后端只要像 SDK 建议的那样"优先认 header、其次认 query"
// 就两种都兼容。tokenTransport 可显式配 "query"（已知有 Kong，省掉那次白撞）
// 或 "header"（确定没有网关，且不希望 token 出现在 access log 里）。
/** 403 是不是网关拦的（而非应用自己的权限不足）。判据是响应体特征。 */
function looksGatewayBlocked(text) {
    return /nd-auth-restriction|auth is deny/i.test(String(text || ""));
}
function createTransport(ctx, storage) {
    /**
     * 把本站 token 拼进查询参。**宿主的 fetch 包装器也要用它**——SDK 只管自己发的
     * 请求，业务接口（/api/my/sessions 之类）同样会被 Kong 拦。
     */
    function withTokenQuery(u, tok) {
        const t = tok || storage.currentToken();
        if (!t)
            return u;
        try {
            const x = new URL(u, window.location.origin);
            if (!x.searchParams.get("token"))
                x.searchParams.set("token", t);
            // ⚠️ 跨域时必须返回完整 URL。只拼 pathname+search+hash 会把 host 丢掉，
            // 请求静默打到当前页面的 origin —— 配了 apiBase 指向独立 API 域名的接入方，
            // header 模式一切正常，**只有降级到 query 载体那一刻**才断，而降级恰恰
            // 发生在生产（本地/dev 没有 Kong）。同源仍返回相对路径，保持原有行为。
            return x.origin === window.location.origin
                ? x.pathname + x.search + x.hash
                : x.href;
        }
        catch (_a) {
            return u; // 解析不了就原样返回：宁可这一发没带上 token，也不能把地址改坏
        }
    }
    function authedJson(path, init) {
        const o = init || {};
        const tok = o.token || storage.currentToken();
        function send(viaQuery) {
            const headers = {};
            if (o.body)
                headers["Content-Type"] = "application/json";
            if (!viaQuery && tok)
                headers["Authorization"] = "Bearer " + tok;
            const init = { method: o.method || "GET", headers: headers };
            if (o.body)
                init.body = JSON.stringify(o.body);
            return ctx.origFetch(viaQuery ? withTokenQuery(ctx.url(path), tok) : ctx.url(path), init);
        }
        return send(ctx.queryAuthStuck)
            .then(function (r) {
            // 已经在用 query、或显式指定了载体，就不再试探
            if (ctx.queryAuthStuck || ctx.tokenTransport !== "auto" || !r || r.status !== 403)
                return r;
            // 读 body 判断是不是网关拦的。clone 是为了普通 403 还能正常解析。
            const peek = r.clone ? r.clone().text() : Promise.resolve("");
            return peek.catch(function () { return ""; }).then(function (text) {
                if (!looksGatewayBlocked(text))
                    return r; // 应用自己的 403，照常返回
                ctx.queryAuthStuck = true;
                return send(true);
            });
        })
            .then(function (r) {
            return r && r.json ? r.json().catch(function () { return null; }) : null;
        })
            .catch(function () { return null; });
    }
    return { withTokenQuery: withTokenQuery, authedJson: authedJson };
}

// ── 数据层（headless，不碰 DOM）──────────────────────────────────────────
/* 只负责取数和下单，**不渲染任何东西**。内置徽章和充值弹层都是基于这几个函数
 * 搭起来的——接入方自己做 UI 时用的是同一套，不存在"内置 UI 能做、自己做就
 * 差一截"的情况。
 *
 * 自己做 UI 时这几个函数替你处理掉的事：带本站 token、拼接口前缀、
 * 非 200 归一成 null、以及订单状态那套语义（见 pollOrder）。
 *
 * ⚠️ 回调参数名 `d` 是契约的一部分：python 的 test_browser_contract.py 用
 * 变量名正则从本目录源码里提取"浏览器读了哪些字段"来对齐服务端响应，
 * 禁止改名。 */
function createApi(transport) {
    /**
     * 余额 + 充值选项。查不到时返回体带 unavailable:true（不是抛错）。
     *
     * fresh=true 要求服务端**绕过它那层缓存**去上游真查。用在"用户正看着这个数字"
     * 的时刻：页面加载挂徽章、充值后等到账、切回前台。服务端的缓存判据是"本站
     * 花过钱"，而充值（尤其在 AI 员工平台那边充的）它看不见 —— 不要 fresh 的话，
     * 充完值反复查到的都是充值前那份，徽章永远不变（2026-08-18 实测踩到）。
     * 后台那 15 秒一轮的常规轮询不传它，缓存的省量效果全靠那一路。
     */
    function getWallet(token, fresh) {
        const path = fresh ? "/api/auth/wallet?fresh=1" : "/api/auth/wallet";
        return transport.authedJson(path, { token: token });
    }
    /**
     * 下单。params: { planCode } 或 { amount }，外加 { channel }。
     * 返回 { orderNo, payQrCode?, paymentUrl? }；失败返回 { error }。
     *
     * ⚠️ payQrCode 的形态**按渠道不同**，自己做 UI 时必须分开处理：
     *   - alipay_pc_qr：收银台 URL，直接 iframe，别自己画码
     *   - wx_pub_qr   ：weixin:// 协议链接，必须画成二维码图片
     * 两者都当图片处理的话，微信那条必然显示不出来（且 mock 测不出来）。
     */
    function createOrder(params, token) {
        return transport.authedJson("/api/billing/order", {
            method: "POST",
            body: params || {},
            token: token,
        });
    }
    /** 单次查询订单状态。 */
    function queryOrder(orderNo, token) {
        return transport.authedJson("/api/billing/order/" + encodeURIComponent(orderNo), { token: token });
    }
    /**
     * 轮询订单直到终态。**返回一个 stop 函数**，务必在关闭 UI 时调用它，
     * 否则用户关掉界面后轮询还在后台跑。
     *
     * 订单状态语义（照抄 portal，自己解读容易搞错）：
     *   1 = 支付成功    2 = 超时关闭（没扣款）
     *   3 = 支付失败    4 = 已退款
     *
     * onTimeout 是**轮空**，不等于支付失败：可能只是回调慢或页面开太久。
     * 提示文案千万别写成"支付失败"——钱可能已经扣了。
     */
    function pollOrder(orderNo, o) {
        o = o || {};
        // ⚠️ 下限会**静默改写**传入值：配 intervalMs:10 实际按 100 跑。它防的是
        // 误配成 0/负数导致的忙轮询，不是限制你调快。（同样的下限语义在
        // YunyiOidc.fallbackTtlMs 上让人踩过一次——测试传了小于下限的值，
        // 然后困惑为什么行为对不上。）
        const intervalMs = Math.max(100, Number(o.intervalMs) || 3000);
        const maxTries = Math.max(1, Number(o.maxTries) || 100);
        const opt = o;
        let tries = 0;
        let timer = setInterval(function () {
            tries++;
            if (tries > maxTries) {
                stop();
                if (typeof opt.onTimeout === "function")
                    opt.onTimeout();
                return;
            }
            queryOrder(orderNo, opt.token).then(function (d) {
                if (!timer)
                    return; // 已经被 stop 掉，别再回调
                if (!d || typeof d.status !== "number")
                    return;
                if (typeof opt.onTick === "function")
                    opt.onTick(d);
                if (d.status === 1) {
                    stop();
                    if (typeof opt.onPaid === "function")
                        opt.onPaid(d);
                }
                else if (d.status >= 2) {
                    stop();
                    if (typeof opt.onFailed === "function")
                        opt.onFailed(d);
                }
            });
        }, intervalMs);
        function stop() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }
        return stop;
    }
    return {
        getWallet: getWallet,
        createOrder: createOrder,
        queryOrder: queryOrder,
        pollOrder: pollOrder,
    };
}

// ── HTML 转义 ───────────────────────────────────────────────────────────
//
// 本包用字符串拼 innerHTML（零运行时依赖、不引模板库），所以**每一个插值都必须过
// esc()**。这些值不是"我们自己的字符串"：套餐名/价格来自 portal 的套餐表
// （全平台共用，别的业务方也能往里写）、payQrCode 和 orderNo 来自支付链路、
// username 来自 IdP、错误文案直接是上游 `d.error`。
//
// 漏一处的代价是整站会话失守：本站 token 就在同 origin 的 localStorage 里，
// 而"浏览器只持有 opaque token"是本 SDK 的第一约束——把 token 放进一个能被
// 上游字符串注入的 DOM，等于自己拆了这条约束。
//
// **信任边界**：`t()` 的 i18n 文案和 balText() 这种纯数字输出属于本地可控，
// 不转义（转了反而会把文案里的 & 显示成 &amp;）。凡是从 HTTP 响应里取出来的
// 字段——不管看起来多像枚举值（channel code 也是上游给的）——一律转义。
// 加新插值点时先问一句：这个值是响应体里来的吗？是就 esc()。
//
// 七处例外，**有意不配变异测试**（scripts/mutate-escapes.sh 的排除清单与此同步）：
// renderPayResult 的 title/detail、showGate 的 message/gate_title、
// mountWalletChip 的 balance_unavailable_hint——实参全部是 t() 的返回值
// （见调用点），本身就在信任边界内；showGate 的 opts.logo——宿主配置，
// 本地可控；renderForm 的 p.coins——typeof === "number" 守卫使 esc 只会收到
// 数字，去掉 esc 也无法注入（等价变异，测试不可能变红），字符串形态的 coins
// 根本到不了 DOM（有测试钉住这一点）。这些仍然套了 esc() 是纵深防御——
// 接入方的 i18n 词条若来自后端动态下发，就不再是本地可控的了。做转义点的
// 变异检查时这些不会变红，那是预期而不是遗漏。
function esc(v) {
    return String(v == null ? "" : v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
/**
 * 要放进 href/src 的值。光转义不够——`javascript:alert(1)` 里一个特殊字符都
 * 没有，转义完原样通过，点一下照样执行。必须先过协议白名单。
 * 放行 http/https（收银台 URL）、data:image（二维码图）、weixin:（唤起微信），
 * 其余一律返回空串（调用方据此不渲染链接）。
 */
function safeUrl(v) {
    const s = String(v == null ? "" : v).trim();
    if (/^https?:\/\//i.test(s) || /^data:image\//i.test(s) || /^weixin:\/\//i.test(s)) {
        return esc(s);
    }
    return "";
}

/**
 * Utilities for hex, bytes, CSPRNG.
 * @module
 */
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
// We use WebCrypto aka globalThis.crypto, which exists in browsers and node.js 16+.
// node.js versions earlier than v19 don't declare it in global scope.
// For node.js, package.json#exports field mapping rewrites import
// from `crypto` to `cryptoNode`, which imports native module.
// Makes the utils un-importable in browsers without a bundler.
// Once node.js 18 is deprecated (2025-04-30), we can just drop the import.
/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
function isBytes(a) {
    return a instanceof Uint8Array || (ArrayBuffer.isView(a) && a.constructor.name === 'Uint8Array');
}
/** Asserts something is Uint8Array. */
function abytes(b, ...lengths) {
    if (!isBytes(b))
        throw new Error('Uint8Array expected');
    if (lengths.length > 0 && !lengths.includes(b.length))
        throw new Error('Uint8Array expected of length ' + lengths + ', got length=' + b.length);
}
/** Asserts a hash instance has not been destroyed / finished */
function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
        throw new Error('Hash instance has been destroyed');
    if (checkFinished && instance.finished)
        throw new Error('Hash#digest() has already been called');
}
/** Asserts output is properly-sized byte array */
function aoutput(out, instance) {
    abytes(out);
    const min = instance.outputLen;
    if (out.length < min) {
        throw new Error('digestInto() expects output buffer of length at least ' + min);
    }
}
/** Zeroize a byte array. Warning: JS provides no guarantees. */
function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
        arrays[i].fill(0);
    }
}
/** Create DataView of an array for easy byte-level manipulation. */
function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
/** The rotate right (circular right shift) operation for uint32 */
function rotr(word, shift) {
    return (word << (32 - shift)) | (word >>> shift);
}
/**
 * Converts string to bytes using UTF8 encoding.
 * @example utf8ToBytes('abc') // Uint8Array.from([97, 98, 99])
 */
function utf8ToBytes(str) {
    if (typeof str !== 'string')
        throw new Error('string expected');
    return new Uint8Array(new TextEncoder().encode(str)); // https://bugzil.la/1681809
}
/**
 * Normalizes (non-hex) string or Uint8Array to Uint8Array.
 * Warning: when Uint8Array is passed, it would NOT get copied.
 * Keep in mind for future mutable operations.
 */
function toBytes(data) {
    if (typeof data === 'string')
        data = utf8ToBytes(data);
    abytes(data);
    return data;
}
/** For runtime check if class implements interface */
class Hash {
}
/** Wraps hash function, creating an interface on top of it */
function createHasher(hashCons) {
    const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
    const tmp = hashCons();
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = () => hashCons();
    return hashC;
}

/**
 * Internal Merkle-Damgard hash utils.
 * @module
 */
/** Polyfill for Safari 14. https://caniuse.com/mdn-javascript_builtins_dataview_setbiguint64 */
function setBigUint64(view, byteOffset, value, isLE) {
    if (typeof view.setBigUint64 === 'function')
        return view.setBigUint64(byteOffset, value, isLE);
    const _32n = BigInt(32);
    const _u32_max = BigInt(0xffffffff);
    const wh = Number((value >> _32n) & _u32_max);
    const wl = Number(value & _u32_max);
    const h = isLE ? 4 : 0;
    const l = isLE ? 0 : 4;
    view.setUint32(byteOffset + h, wh, isLE);
    view.setUint32(byteOffset + l, wl, isLE);
}
/** Choice: a ? b : c */
function Chi(a, b, c) {
    return (a & b) ^ (~a & c);
}
/** Majority function, true if any two inputs is true. */
function Maj(a, b, c) {
    return (a & b) ^ (a & c) ^ (b & c);
}
/**
 * Merkle-Damgard hash construction base class.
 * Could be used to create MD5, RIPEMD, SHA1, SHA2.
 */
class HashMD extends Hash {
    constructor(blockLen, outputLen, padOffset, isLE) {
        super();
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
    }
    update(data) {
        aexists(this);
        data = toBytes(data);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        for (let pos = 0; pos < len;) {
            const take = Math.min(blockLen - this.pos, len - pos);
            // Fast path: we have at least one block in input, cast it to view and process
            if (take === blockLen) {
                const dataView = createView(data);
                for (; blockLen <= len - pos; pos += blockLen)
                    this.process(dataView, pos);
                continue;
            }
            buffer.set(data.subarray(pos, pos + take), this.pos);
            this.pos += take;
            pos += take;
            if (this.pos === blockLen) {
                this.process(view, 0);
                this.pos = 0;
            }
        }
        this.length += data.length;
        this.roundClean();
        return this;
    }
    digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        // Padding
        // We can avoid allocation of buffer for padding completely if it
        // was previously not allocated here. But it won't change performance.
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        // append the bit '1' to the message
        buffer[pos++] = 0b10000000;
        clean(this.buffer.subarray(pos));
        // we have less than padOffset left in buffer, so we cannot put length in
        // current block, need process it and pad again
        if (this.padOffset > blockLen - pos) {
            this.process(view, 0);
            pos = 0;
        }
        // Pad until full block byte with zeros
        for (let i = pos; i < blockLen; i++)
            buffer[i] = 0;
        // Note: sha512 requires length to be 128bit integer, but length in JS will overflow before that
        // You need to write around 2 exabytes (u64_max / 8 / (1024**6)) for this to happen.
        // So we just write lowest 64 bits of that value.
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        // NOTE: we do division by 4 later, which should be fused in single op with modulo by JIT
        if (len % 4)
            throw new Error('_sha2: outputLen should be aligned to 32bit');
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
            throw new Error('_sha2: outputLen bigger than state');
        for (let i = 0; i < outLen; i++)
            oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
    }
    _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (length % blockLen)
            to.buffer.set(buffer);
        return to;
    }
    clone() {
        return this._cloneInto();
    }
}
/**
 * Initial SHA-2 state: fractional parts of square roots of first 16 primes 2..53.
 * Check out `test/misc/sha2-gen-iv.js` for recomputation guide.
 */
/** Initial SHA256 state. Bits 0..32 of frac part of sqrt of primes 2..19 */
const SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/**
 * SHA2 hash function. A.k.a. sha256, sha384, sha512, sha512_224, sha512_256.
 * SHA256 is the fastest hash implementable in JS, even faster than Blake3.
 * Check out [RFC 4634](https://datatracker.ietf.org/doc/html/rfc4634) and
 * [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
 * @module
 */
/**
 * Round constants:
 * First 32 bits of fractional parts of the cube roots of the first 64 primes 2..311)
 */
// prettier-ignore
const SHA256_K = /* @__PURE__ */ Uint32Array.from([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
/** Reusable temporary buffer. "W" comes straight from spec. */
const SHA256_W = /* @__PURE__ */ new Uint32Array(64);
class SHA256 extends HashMD {
    constructor(outputLen = 32) {
        super(64, outputLen, 8, false);
        // We cannot use array here since array allows indexing by variable
        // which means optimizer/compiler cannot use registers.
        this.A = SHA256_IV[0] | 0;
        this.B = SHA256_IV[1] | 0;
        this.C = SHA256_IV[2] | 0;
        this.D = SHA256_IV[3] | 0;
        this.E = SHA256_IV[4] | 0;
        this.F = SHA256_IV[5] | 0;
        this.G = SHA256_IV[6] | 0;
        this.H = SHA256_IV[7] | 0;
    }
    get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
    }
    process(view, offset) {
        // Extend the first 16 words into the remaining 48 words w[16..63] of the message schedule array
        for (let i = 0; i < 16; i++, offset += 4)
            SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
            const W15 = SHA256_W[i - 15];
            const W2 = SHA256_W[i - 2];
            const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ (W15 >>> 3);
            const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ (W2 >>> 10);
            SHA256_W[i] = (s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16]) | 0;
        }
        // Compression function main loop, 64 rounds
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
            const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
            const T1 = (H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i]) | 0;
            const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
            const T2 = (sigma0 + Maj(A, B, C)) | 0;
            H = G;
            G = F;
            F = E;
            E = (D + T1) | 0;
            D = C;
            C = B;
            B = A;
            A = (T1 + T2) | 0;
        }
        // Add the compressed chunk to the current hash value
        A = (A + this.A) | 0;
        B = (B + this.B) | 0;
        C = (C + this.C) | 0;
        D = (D + this.D) | 0;
        E = (E + this.E) | 0;
        F = (F + this.F) | 0;
        G = (G + this.G) | 0;
        H = (H + this.H) | 0;
        this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
        clean(SHA256_W);
    }
    destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
    }
}
/**
 * SHA2-256 hash function from RFC 4634.
 *
 * It is the fastest JS hash, even faster than Blake3.
 * To break sha256 using birthday attack, attackers need to try 2^128 hashes.
 * BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
 */
const sha256$1 = /* @__PURE__ */ createHasher(() => new SHA256());

/**
 * SHA2-256 a.k.a. sha256. In JS, it is the fastest hash, even faster than Blake3.
 *
 * To break sha256 using birthday attack, attackers need to try 2^128 hashes.
 * BTC network is doing 2^70 hashes/sec (2^95 hashes/year) as per 2025.
 *
 * Check out [FIPS 180-4](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf).
 * @module
 * @deprecated
 */
/** @deprecated Use import from `noble/hashes/sha2` module */
const sha256 = sha256$1;

function randHex(bytes) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a, function (b) {
        return b.toString(16).padStart(2, "0");
    }).join("");
}
function b64urlFromBytes(bytes) {
    let s = "";
    const arr = new Uint8Array(bytes);
    for (const b of arr)
        s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** 内联 JS 实现兜底。这一步也炸（理论上不会）才退回无 PKCE，别把登录卡死。 */
function jsFallback(verifier, encoded) {
    try {
        return { verifier: verifier, challenge: b64urlFromBytes(sha256(encoded)) };
    }
    catch (_a) {
        return null;
    }
}
/** 返回 {verifier, challenge}；只有连 CSPRNG 都没有时才 resolve(null)。 */
function makePkce() {
    let bytes;
    try {
        bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
    }
    catch (_a) {
        // 没有 CSPRNG 就放弃 PKCE。**绝不能退回 Math.random 之类的弱随机**——
        // 可猜的 verifier 给人"有防护"的错觉，比明着没有更糟。
        return Promise.resolve(null);
    }
    const verifier = b64urlFromBytes(bytes); // 43 字符，落在 RFC 要求的 43~128 区间
    const encoded = new TextEncoder().encode(verifier);
    const subtle = typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function"
        ? crypto.subtle
        : null;
    if (subtle) {
        return subtle
            .digest("SHA-256", encoded)
            .then(function (digest) {
            return { verifier: verifier, challenge: b64urlFromBytes(digest) };
        })
            .catch(function () {
            // subtle 在却算不出（个别 WebView 的残缺实现）→ 换 JS 实现，仍不放弃 PKCE
            return jsFallback(verifier, encoded);
        });
    }
    return Promise.resolve(jsFallback(verifier, encoded));
}

/* ⚠️ 本文件里 `cfg.client_id` / `cfg.authorization_endpoint` 的写法是契约的
 * 一部分：python 的 test_browser_contract.py 断言这两个子串存在，保证
 * /api/auth/config 端点维持 snake_case。禁止改成解构或换名。 */
function createGate(ctx, config, storage) {
    // ── 登录门 ──────────────────────────────────────────────────────────────
    function showGate(cfg, message, o) {
        const busy = Boolean(o && o.busy);
        // noLogin：只说明情况、不给登录按钮。用于平台入场通道过期——那里点"登录"
        // 会掉进云一账号体系，换成另一个人的 externalId，之前的作品全都不在了。
        const noLogin = Boolean(o && o.noLogin);
        let gateEl = ctx.gateEl;
        if (!gateEl) {
            const style = document.createElement("style");
            style.textContent = [
                "#agentia-auth-gate{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;",
                "justify-content:center;background:#f7f4ee;font-family:system-ui,-apple-system,'PingFang SC',sans-serif}",
                "#agentia-auth-gate .card{max-width:340px;margin:16px;padding:36px 32px;border-radius:20px;",
                "background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.10);text-align:center}",
                "#agentia-auth-gate .logo{font-size:44px;line-height:1}",
                "#agentia-auth-gate h1{margin:14px 0 6px;font-size:20px;color:#2b2620}",
                "#agentia-auth-gate p{margin:0 0 22px;font-size:13px;line-height:1.7;color:#8a8177}",
                "#agentia-auth-gate .err{color:#c0392b;font-size:13px;margin:0 0 14px}",
                "#agentia-auth-gate button{width:100%;padding:12px 0;border:0;border-radius:12px;font-size:15px;",
                "cursor:pointer;color:#fff;background:linear-gradient(135deg,#ff9a5a,#f0687f);transition:opacity .15s}",
                "#agentia-auth-gate button:disabled{opacity:.6;cursor:default}",
                "@media (prefers-color-scheme:dark){#agentia-auth-gate{background:#1c1a17}",
                "#agentia-auth-gate .card{background:#2a2724;box-shadow:0 12px 40px rgba(0,0,0,.5)}",
                "#agentia-auth-gate h1{color:#f0ebe3}#agentia-auth-gate p{color:#a89e92}}",
            ].join("");
            document.head.appendChild(style);
            gateEl = document.createElement("div");
            gateEl.id = "agentia-auth-gate";
            (document.body || document.documentElement).appendChild(gateEl);
            ctx.gateEl = gateEl;
        }
        gateEl.innerHTML =
            '<div class="card"><div class="logo">' + esc(ctx.opts.logo || "🔐") + "</div>" +
                "<h1>" + esc(ctx.t("auth.gate_title", ctx.opts.appName || "登录")) + "</h1>" +
                "<p>" + ctx.t("auth.gate_desc", "使用你的账户登录后即可开始使用") + "</p>" +
                (message ? '<div class="err">' + esc(message) + "</div>" : "") +
                (noLogin
                    ? ""
                    : '<button id="agentia-auth-login"' + (busy ? " disabled" : "") + ">" +
                        (busy ? ctx.t("auth.gate_busy", "登录中…") : ctx.t("auth.gate_btn", "登录")) +
                        "</button>") +
                "</div>";
        const btn = gateEl.querySelector("#agentia-auth-login");
        if (btn && !busy) {
            btn.onclick = function () {
                // 生成 PKCE challenge 是异步的（crypto.subtle.digest）。连点两次会让第二轮
                // 的 verifier 覆盖第一轮，而跳转可能已带着第一轮的 challenge 发出——上游
                // 校验必然失败。禁用按钮把这条竞态堵死。
                btn.disabled = true;
                btn.textContent = ctx.t("auth.gate_busy", "登录中…");
                beginLogin(cfg);
            };
        }
    }
    /* 登出之后的下一次登录，往 authorize 请求上追加「强制重新认证」参数。
     *
     * 默认 `prompt=login`（OIDC Core §3.1.2.1：要求提供方重新认证终端用户，即使
     * 已有会话）。做成可配是因为**云一网关是否实现了它还没有书面确认** —— 它的
     * discovery 没有声明 `prompt_values_supported`，而按 OIDC 规范提供方应当**忽略**
     * 不认识的参数。也就是说万一没实现，我们发过去毫无效果，且**不会有任何报错**：
     * 代码看着是对的，行为和以前一样。真出这种情况，接入方把
     * `reauthParams: { max_age: "0" }`（标准的等效手段）配上就行，不必等 SDK 发版。
     *
     * 返回值直接是 "&k=v&k=v" 形式，拼在 authorize URL 末尾；不需要时返回空串。 */
    function reauthQuery() {
        if (!storage.needsForceReauth())
            return "";
        const spec = ctx.opts.reauthParams;
        if (spec === false)
            return "";
        // 显式传空对象 = 关掉（与 walletRetryDelays 传空数组同一约定）
        const params = spec && typeof spec === "object" ? spec : { prompt: "login" };
        let out = "";
        for (const k in params) {
            if (!Object.prototype.hasOwnProperty.call(params, k))
                continue;
            const v = params[k];
            if (!k || v === undefined || v === null)
                continue;
            out += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(String(v));
        }
        return out;
    }
    /* ── 静默单点登录入口（默认 `?sso=1`）────────────────────────────────────
     *
     * 宿主站点已在同一提供方登录时，外链/内嵌本工具带上该参数：未登录不再停在
     * 登录门等用户点「登录」，直接发起 authorize —— 提供方侧已有会话就免密秒回。
     * 参数名可配（opts.ssoParam），`false` 关闭；语义详见 types.ts。
     *
     * 只在「即将渲染登录门」的两个点被调（bootstrap 无 token / reauth 过期），
     * 所以已登录、平台注入态、agentiaToken 等路径天然不受影响 —— 不需要在这里
     * 重复判定来路。
     *
     * 防循环：每标签页只自动发起一次（storage.markSsoTried，sessionStorage）。
     * 用户在提供方页面中途放弃、按返回键回到带参数的 URL 时，第二次进来落回
     * 普通登录门，而不是又被弹走。标记在换到 token 成功后清除（handleCallback），
     * 与 clearForceReauth 同一时机 —— "这轮自动登录真的走完了"才算数。
     *
     * 返回 true = 已接管（占位门已渲染、跳转已发起），调用方别再渲染登录门。 */
    function maybeAutoLogin(cfg) {
        const spec = ctx.opts.ssoParam;
        if (spec === false)
            return false;
        const name = typeof spec === "string" && spec ? spec : "sso";
        let requested = false;
        try {
            requested = new URLSearchParams(window.location.search).has(name);
        }
        catch (_a) {
            return false;
        }
        if (!requested || storage.ssoTriedOnce())
            return false;
        storage.markSsoTried();
        // 跳转发起前先渲染禁用态的「登录中…」占位，别让用户对着白屏
        showGate(cfg, "", { busy: true });
        void beginLogin(cfg);
        return true;
    }
    function beginLogin(cfg) {
        const state = randHex(16);
        try {
            sessionStorage.setItem(STATE_KEY, state);
            sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search + window.location.hash);
            sessionStorage.removeItem(PKCE_KEY); // 上一次没走完的残留，别带进这轮
        }
        catch (_a) { }
        return makePkce().then(function (pkce) {
            if (pkce) {
                try {
                    sessionStorage.setItem(PKCE_KEY, pkce.verifier);
                }
                catch (_a) {
                    pkce = null; // 存不下 verifier 就别发 challenge，否则回调必然换不到 token
                }
            }
            const endpoint = cfg.authorization_endpoint || (cfg.authority || "") + "/oauth/authorize";
            window.location.href =
                endpoint +
                    "?client_id=" + encodeURIComponent(cfg.client_id || "") +
                    "&response_type=code" +
                    "&redirect_uri=" + encodeURIComponent(window.location.origin + ctx.callbackPath) +
                    "&scope=" + encodeURIComponent(ctx.opts.scope || "openid profile email") +
                    "&state=" + state +
                    (pkce ? "&code_challenge=" + pkce.challenge + "&code_challenge_method=S256" : "") +
                    reauthQuery();
        });
    }
    // ── /callback ───────────────────────────────────────────────────────────
    function handleCallback() {
        const p = new URLSearchParams(window.location.search);
        const code = p.get("code") || "";
        const state = p.get("state") || "";
        let saved = "", ret = "/", verifier = "";
        try {
            saved = sessionStorage.getItem(STATE_KEY) || "";
            ret = sessionStorage.getItem(RETURN_KEY) || "/";
            verifier = sessionStorage.getItem(PKCE_KEY) || "";
            sessionStorage.removeItem(STATE_KEY);
            sessionStorage.removeItem(RETURN_KEY);
            // verifier 是一次性的：留着它，下一次登录若走了无 PKCE 分支就会带上
            // 一个与本轮 challenge 无关的旧值，上游直接拒绝
            sessionStorage.removeItem(PKCE_KEY);
        }
        catch (_a) { }
        return config.fetchCfg().then(function (cfg) {
            if (!cfg.enabled) {
                window.location.replace("/");
                return new Promise(function () { });
            }
            if (!code || !state || state !== saved) {
                showGate(cfg, code ? ctx.t("auth.gate_state_mismatch", "登录状态校验失败，请重试") : "");
                return new Promise(function () { });
            }
            showGate(cfg, "", { busy: true });
            return ctx.origFetch(ctx.url("/api/auth/exchange"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(verifier
                    ? {
                        code: code,
                        redirect_uri: window.location.origin + ctx.callbackPath,
                        code_verifier: verifier,
                    }
                    : { code: code, redirect_uri: window.location.origin + ctx.callbackPath }),
            })
                .catch(function () { return null; })
                .then(function (res) { return res && res.ok ? res.json().catch(function () { return null; }) : null; })
                .then(function (data) {
                if (!data || !data.token) {
                    showGate(cfg, ctx.t("auth.gate_failed", "登录失败，请重试"));
                    return new Promise(function () { });
                }
                storage.setStored(data.token, "yunyi");
                // 到这儿才清「强制重新认证」标记：换到 token 才算这轮登录真的走完了。
                // 放在发起 authorize 时清会留下一个只在"用户中途放弃登录"时才出现的洞
                // ——下次进来又被免密秒登（见 storage.markForceReauth 的说明）。
                storage.clearForceReauth();
                // SSO 防循环标记同此时机：换到 token 才算这轮自动登录真的走完了
                storage.clearSsoTried();
                const target = new URL(ret, window.location.origin);
                if (target.pathname === ctx.callbackPath)
                    target.pathname = "/";
                target.searchParams.delete("token"); // 令牌只落 localStorage
                window.location.replace(target.pathname + target.search + target.hash);
                return new Promise(function () { }); // 正在导航离开，挂起等待中的请求
            });
        });
    }
    return { showGate: showGate, handleCallback: handleCallback, maybeAutoLogin: maybeAutoLogin };
}

/* 余额的「展示单位」。平台内部记账用原始积分，界面显示的是**展示币**——同一笔钱
 * 两种单位（实测 3000 原始积分 = 100 展示币）。服务端给了 coin 就显示它，两边才
 * 对得上；给不了（币种停用 / 汇率没配 / 取不到）就退回原始积分，绝不因此显示空白。
 *
 * 名字只能从服务端取，写死必错 —— 2026-08-19 实测：coinCode 恒为 seashell，
 * 而显示名已从「贝壳 / Seashell」改成「积分 / Points」，dev 与生产都是。
 * 这次改名就是"写死必错"的实证。 */
/* 展示币的四角星图标。路径直接取自平台的 credits-star.svg
 * （agentia assets/icons/sidebar/credits-star.svg，engine-web 的
 * TaskDetailHeader 也用这枚），fill/stroke 都是 currentColor，跟着文字色走，
 * 深色模式自动翻转。内联而不是外链：本包零运行时依赖、要能被 <script> 直接引，
 * 而且接入方的 CSP 常禁外部资源。 */
const COIN_ICON = '<svg class="agentia-coin-star" viewBox="0 0 20 20" fill="none" aria-hidden="true" ' +
    'style="width:1em;height:1em;vertical-align:-0.125em;margin-right:.25em">' +
    '<path d="M7.3312 7.3376L10 2L12.6688 7.3376L18 10L12.6688 12.6688L10 18L7.3312 12.6688L2 10L7.3312 7.3376Z" ' +
    'fill="currentColor" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';
function coinUnitOf(d) {
    const c = d && d.coin;
    if (!c || typeof c.available !== "number")
        return null;
    // ⚠️ 没真正换算时（币种启用但汇率没配）available 就是**积分原值**。
    // 这时挂上展示币的图标 = 拿一个原始积分数冒充展示币数，比不显示还糟。
    if (c.converted === false)
        return null;
    // 只返回数值：单位名不进界面（各环境配置不一致，见渲染处的说明），
    // 需要文字的宿主自己从 wallet.coin.name / coin.i18n 取。
    return { value: c.available };
}
/* 余额的可比较指纹。两个通道的字段不同（积分 / 人民币），拿它判断
 * "值到底变没变"。取不到数值时返回 null —— null 不参与相等判断，
 * 免得"查询失败"和"余额未变"互相误判。 */
function balanceKeyOf(d) {
    if (!d)
        return null;
    // 键要跟着**显示出来的那个数**走：只看 credits 的话，充值到账后原始积分变了、
    // 展示币因为取整没变（或反过来），"等值变化再刷新"就会判错。
    const u = coinUnitOf(d);
    if (u)
        return "k" + u.value;
    if (typeof d.credits === "number")
        return "c" + d.credits;
    if (typeof d.balanceCny === "number")
        return "y" + d.balanceCny;
    return null;
}

// ── 内置充值弹层（mode=inline，即 AI 员工平台通道）─────────────────────
/* 云一通道的充值是跳外链，不需要弹层；平台通道支持站内下单，所以这里内置
 * 一套最小可用 UI：选套餐/填金额 → 选渠道 → 下单拿二维码 → 轮询订单状态。
 * 所有请求都打本站后端（/api/billing/*），由后端持用户凭证代调 portal——
 * 浏览器全程不接触任何平台凭证。
 * 宿主想自己做 UI 就传 onRecharge，本弹层不会出现。
 *
 * ⚠️ 本文件里 `d`（下单/查单响应）、`balance`（余额）这些变量名是契约的一部分：
 * python 的 test_browser_contract.py 用变量名正则提取"浏览器读了哪些字段"，
 * 禁止改名。`esc(…)`/`safeUrl(…)` 调用的书写形态被 scripts/mutate-escapes.sh
 * 的变异靶逐字匹配，改动时两边同步。 */
function createRecharge(ctx, api) {
    function closeRecharge() {
        // pollTimer 存的是 pollOrder 返回的 stop 函数，不是 interval id
        if (ctx.pollTimer) {
            ctx.pollTimer();
            ctx.pollTimer = null;
        }
        if (ctx.payEl) {
            ctx.payEl.remove();
            ctx.payEl = null;
        }
    }
    function ensureRechargeStyle() {
        if (document.getElementById("agentia-pay-style"))
            return;
        const st = document.createElement("style");
        st.id = "agentia-pay-style";
        st.textContent = [
            "#agentia-pay{position:fixed;inset:0;z-index:99995;display:flex;align-items:center;",
            "justify-content:center;background:rgba(0,0,0,.45);font:14px/1.6 system-ui,-apple-system,'PingFang SC',sans-serif}",
            "#agentia-pay .box{width:min(420px,92vw);max-height:88vh;overflow:auto;padding:24px;border-radius:16px;",
            "background:#fff;color:#2b2620;box-shadow:0 16px 48px rgba(0,0,0,.25)}",
            "#agentia-pay h3{margin:0 0 4px;font-size:17px}",
            "#agentia-pay .bal{color:#8a8177;font-size:13px;margin:0 0 16px}",
            "#agentia-pay .plans{display:grid;gap:8px;margin:0 0 14px}",
            "#agentia-pay .plan{padding:10px 12px;border:1px solid #e6e1d8;border-radius:10px;cursor:pointer;",
            "display:flex;justify-content:space-between;align-items:center;transition:border-color .15s}",
            "#agentia-pay .plan:hover{border-color:#f0687f}",
            "#agentia-pay .plan.on{border-color:#f0687f;background:#fff6f2}",
            "#agentia-pay .plan b{font-weight:600}",
            "#agentia-pay .amt{width:100%;padding:9px 11px;border:1px solid #e6e1d8;border-radius:10px;",
            "font-size:14px;margin:0 0 14px;box-sizing:border-box}",
            "#agentia-pay .chs{display:flex;gap:8px;margin:0 0 16px}",
            "#agentia-pay .ch{flex:1;padding:8px 0;text-align:center;border:1px solid #e6e1d8;border-radius:10px;cursor:pointer}",
            "#agentia-pay .ch.on{border-color:#f0687f;background:#fff6f2}",
            "#agentia-pay .act{display:flex;gap:10px}",
            "#agentia-pay button{flex:1;padding:10px 0;border:0;border-radius:10px;font-size:14px;cursor:pointer}",
            "#agentia-pay .go{color:#fff;background:linear-gradient(135deg,#ff9a5a,#f0687f)}",
            "#agentia-pay .go:disabled{opacity:.6;cursor:default}",
            "#agentia-pay .cancel{background:#f1efea;color:#6b635a}",
            "#agentia-pay .qr{text-align:center}",
            "#agentia-pay .qr img{width:210px;height:210px;border:1px solid #eee;border-radius:10px}",
            "#agentia-pay .tip{color:#8a8177;font-size:12px;margin-top:10px}",
            "#agentia-pay .err{color:#c0392b;font-size:13px;margin:0 0 12px}",
            "@media (prefers-color-scheme:dark){#agentia-pay .box{background:#2a2724;color:#f0ebe3}",
            "#agentia-pay .plan,#agentia-pay .ch,#agentia-pay .amt{border-color:#4a453e;background:transparent;color:inherit}",
            "#agentia-pay .plan.on,#agentia-pay .ch.on{background:#3a332c}",
            "#agentia-pay .cancel{background:#3a352f;color:#c9c1b6}}",
        ].join("");
        document.head.appendChild(st);
    }
    function openRecharge(tok, options, balance) {
        closeRecharge();
        ensureRechargeStyle();
        const plans = (options && options.plans) || [];
        const channels = (options && options.channels) || ["wx_pub_qr"];
        const firstPlan = plans[0];
        const sel = {
            planCode: plans.length && firstPlan ? firstPlan.code : "",
            channel: channels[0],
        };
        const box = document.createElement("div");
        box.id = "agentia-pay";
        (document.body || document.documentElement).appendChild(box);
        ctx.payEl = box;
        function balText() {
            if (!balance)
                return "";
            const u = coinUnitOf(balance);
            // 同样只给图标不给单位名，理由见徽章那处
            if (u)
                return ctx.t("auth.balance_label", "当前余额") + "：" + COIN_ICON + u.value;
            if (typeof balance.credits === "number") {
                return ctx.t("auth.balance_credits", "当前积分") + "：" + balance.credits;
            }
            if (typeof balance.balanceCny === "number")
                return "当前余额：¥" + balance.balanceCny.toFixed(2);
            return "";
        }
        function renderForm(errMsg) {
            const payEl = ctx.payEl;
            if (!payEl)
                return;
            const planHtml = plans.length
                ? '<div class="plans">' + plans.map(function (p) {
                    return '<div class="plan' + (p.code === sel.planCode ? " on" : "") + '" data-code="' + esc(p.code) + '">' +
                        "<span>" + esc(p.name || p.code) +
                        // 套餐也按展示币显示，否则会出现"余额 10000 贝壳 / 套餐 300 积分"
                        // 这种混着两种单位的界面，用户没法判断买完够不够用
                        (typeof p.coins === "number"
                            ? " · " + COIN_ICON + esc(p.coins)
                            : p.credits ? " · " + esc(p.credits) + ctx.t("auth.credits_unit", " 积分") : "") + "</span>" +
                        "<b>¥" + esc(p.discountedPrice || p.price) + "</b></div>";
                }).join("") + "</div>"
                : '<input class="amt" id="agentia-pay-amt" placeholder="' +
                    ctx.t("auth.amount_placeholder", "充值金额（元）") + '" inputmode="decimal">';
            const chHtml = '<div class="chs">' + channels.map(function (c) {
                const label = c === "alipay_pc_qr" ? ctx.t("auth.alipay", "支付宝") : ctx.t("auth.wechat", "微信");
                // c 来自上游的 recharge.channels，不是本地常量
                return '<div class="ch' + (c === sel.channel ? " on" : "") + '" data-ch="' + esc(c) + '">' + label + "</div>";
            }).join("") + "</div>";
            payEl.innerHTML = '<div class="box">' +
                "<h3>" + ctx.t("auth.recharge_title", "充值") + "</h3>" +
                '<p class="bal">' + balText() + "</p>" +
                (errMsg ? '<div class="err">' + esc(errMsg) + "</div>" : "") +
                planHtml + chHtml +
                '<div class="act"><button class="cancel" id="agentia-pay-x">' + ctx.t("auth.cancel", "取消") +
                '</button><button class="go" id="agentia-pay-go">' + ctx.t("auth.recharge_go", "生成支付码") +
                "</button></div></div>";
            payEl.querySelectorAll(".plan").forEach(function (el) {
                el.onclick = function () { sel.planCode = el.getAttribute("data-code") || ""; renderForm(); };
            });
            payEl.querySelectorAll(".ch").forEach(function (el) {
                el.onclick = function () { sel.channel = el.getAttribute("data-ch") || ""; renderForm(); };
            });
            const cancelBtn = payEl.querySelector("#agentia-pay-x");
            if (cancelBtn)
                cancelBtn.onclick = closeRecharge;
            const goBtn = payEl.querySelector("#agentia-pay-go");
            if (goBtn)
                goBtn.onclick = submit;
        }
        function submit() {
            const payEl = ctx.payEl;
            if (!payEl)
                return;
            const btn = payEl.querySelector("#agentia-pay-go");
            if (btn) {
                btn.disabled = true;
                btn.textContent = ctx.t("auth.submitting", "提交中…");
            }
            const amtEl = payEl.querySelector("#agentia-pay-amt");
            const body = { channel: sel.channel };
            if (sel.planCode)
                body.planCode = sel.planCode;
            const chosen = plans.filter(function (p) { return p.code === sel.planCode; })[0];
            body.amount = chosen ? String(chosen.discountedPrice || chosen.price) : String((amtEl && amtEl.value) || "").trim();
            body.subject = ctx.t("auth.recharge_subject", "积分充值");
            if (!body.amount) {
                renderForm(ctx.t("auth.amount_required", "请填写充值金额"));
                return;
            }
            api.createOrder(body, tok)
                .then(function (d) {
                if (!d || d.error || (!d.payQrCode && !d.paymentUrl)) {
                    renderForm((d && d.error) || ctx.t("auth.recharge_failed", "下单失败，请稍后重试"));
                    return;
                }
                if (d.paymentUrl) {
                    window.open(d.paymentUrl, "_blank", "noopener");
                    closeRecharge();
                    return;
                }
                renderQr(d);
            })
                .catch(function () { renderForm(ctx.t("auth.recharge_failed", "下单失败，请稍后重试")); });
        }
        /* payQrCode 的形态**按渠道不同**（与 portal 官方 PayQrContent.vue 判定一致）：
         *  - alipay_pc_qr：一个收银台 URL → 直接 iframe 加载，不要自己画码
         *  - wx_pub_qr   ：weixin://wxpay/bizpayurl?pr=… 协议链接 → 必须渲染成二维码图片
         * 早期实现把两者都当 base64 图片拼 data: URI，微信那条必然显示不出来
         * （真实下单才暴露——mock 里 payQrCode 是随便填的字符串）。 */
        function renderQr(order) {
            const payEl = ctx.payEl;
            if (!payEl)
                return;
            const raw = String(order.payQrCode || "");
            let inner;
            // safeUrl 兼做协议白名单和转义：`^https?:` 这类前缀检查挡得住 javascript:，
            // 但挡不住 `https://x/" onload="…` 这种闭合属性的写法，两件事都得做。
            const safe = safeUrl(raw);
            if (sel.channel === "alipay_pc_qr" && /^https?:\/\//i.test(raw) && safe) {
                inner = '<iframe src="' + safe + '" style="width:100%;height:340px;border:0;border-radius:10px"></iframe>';
            }
            else if (safe && /^data:image\/|^https?:.*\.(png|jpe?g|gif|webp)(\?|$)/i.test(raw)) {
                inner = '<img src="' + safe + '" alt="qr">'; // 已经是图片
            }
            else {
                // 协议链接：需要画码。零运行时依赖的包不内置 QR 编码器，优先用宿主页面已有的库。
                const qrLib = window.QRCode || window.qrcode;
                if (qrLib && typeof qrLib.toDataURL === "function") {
                    inner = '<img id="agentia-qr-img" alt="qr">';
                    qrLib.toDataURL(raw, { width: 210, margin: 0 }).then(function (d) {
                        const im = ctx.payEl && ctx.payEl.querySelector("#agentia-qr-img");
                        if (im)
                            im.src = d;
                    }).catch(function () { });
                }
                else {
                    // 没有二维码库：退化成可复制的支付链接（手机端点击可直接唤起微信）。
                    // 协议不在白名单内就只显示文本、不给可点链接——上游给了 javascript:
                    // 之类的东西时，宁可让用户复制不了，也不能渲染成一次点击就执行的 <a>。
                    inner =
                        (safe
                            ? '<a href="' + safe + '" style="word-break:break-all;font-size:12px;color:#f0687f">' +
                                esc(raw) + "</a>"
                            : '<code style="word-break:break-all;font-size:12px">' + esc(raw) + "</code>") +
                            '<p class="tip">' + ctx.t("auth.qr_lib_missing", "当前页面未引入二维码库，无法生成扫码图。请在手机上打开上面的链接完成支付，或让开发者引入 qrcode 库。") + "</p>";
                }
            }
            payEl.innerHTML = '<div class="box qr">' +
                "<h3>" + ctx.t("auth.scan_to_pay", "扫码支付") + "</h3>" + inner +
                '<p class="tip">' + ctx.t("auth.scan_tip", "支付完成后余额会自动更新") + "</p>" +
                '<div class="act"><button class="cancel" id="agentia-pay-x">' + ctx.t("auth.close", "关闭") + "</button></div></div>";
            const closeBtn = payEl.querySelector("#agentia-pay-x");
            if (closeBtn)
                closeBtn.onclick = closeRecharge;
            // 轮询订单状态：1=成功 2=超时 3=失败 4=已退款
            //
            // 每种结局都必须让用户看出区别。首版是「成功关弹层、失败也关弹层」，两者
            // 长得一模一样：钱扣没扣、要不要重试，用户只能自己去看余额猜。轮询轮空
            // （5 分钟没等到终态）则连关都不关，二维码继续挂着"支付完成后余额会自动
            // 更新"，而实际上已经没人在看了。
            function stopPoll() {
                if (ctx.pollTimer) {
                    ctx.pollTimer();
                    ctx.pollTimer = null;
                }
            }
            // 停在结果页而不是直接关：钱可能已经扣了，得让用户看见订单号去对账
            function renderPayResult(title, detail, orderNo) {
                stopPoll();
                const el = ctx.payEl;
                if (!el)
                    return;
                el.innerHTML = '<div class="box">' +
                    "<h3>" + esc(title) + "</h3>" +
                    '<div class="err">' + esc(detail) + "</div>" +
                    '<p class="tip">' + ctx.t("auth.order_no", "订单号") + "：" + esc(orderNo) + "</p>" +
                    '<div class="act"><button class="cancel" id="agentia-pay-x">' +
                    ctx.t("auth.close", "关闭") + "</button>" +
                    '<button class="go" id="agentia-pay-retry">' + ctx.t("auth.retry", "重新充值") + "</button></div></div>";
                const xBtn = el.querySelector("#agentia-pay-x");
                if (xBtn)
                    xBtn.onclick = closeRecharge;
                const retryBtn = el.querySelector("#agentia-pay-retry");
                if (retryBtn)
                    retryBtn.onclick = function () { renderForm(); };
            }
            // 内置 UI 自己也走 pollOrder —— 它就是接入方自己做 UI 时会拿到的那个函数。
            // 内部另写一套的话，公开 API 迟早缺东西而没人发现。
            ctx.pollTimer = api.pollOrder(order.orderNo || "", {
                token: tok,
                onPaid: function (d) {
                    closeRecharge();
                    // 带上充值前的余额：支付成功 ≠ 积分已入账，查到同一个数就继续等。
                    // balance 是打开弹层时拿到的，作为"变化基准"足够（它只用于判等）。
                    ctx.late.mountWalletChip(tok, { awaitChangeFrom: balanceKeyOf(balance) });
                    if (typeof ctx.opts.onRecharged === "function")
                        ctx.opts.onRecharged(d);
                },
                onFailed: function (d) {
                    const msg = d.status === 2
                        ? ctx.t("auth.pay_timeout", "订单已超时关闭，没有扣款。可以重新发起一笔。")
                        : d.status === 4
                            ? ctx.t("auth.pay_refunded", "该订单已退款。")
                            : ctx.t("auth.pay_failed", "支付未成功，没有扣款。可以重新发起一笔。");
                    renderPayResult(ctx.t("auth.pay_unfinished", "充值未完成"), msg, order.orderNo);
                    if (typeof ctx.opts.onRechargeFailed === "function")
                        ctx.opts.onRechargeFailed(d);
                },
                onTimeout: function () {
                    // 轮空 ≠ 支付失败：可能只是回调慢或本页开了太久。措辞不能让用户以为钱没扣。
                    renderPayResult(ctx.t("auth.pay_pending_title", "还没等到支付结果"), ctx.t("auth.pay_pending", "如果你已经付过款，积分通常会稍后到账，刷新页面即可查看余额；若长时间未到账请联系客服并提供订单号。"), order.orderNo);
                },
            });
        }
        renderForm();
    }
    return { openRecharge: openRecharge, closeRecharge: closeRecharge };
}

/** Node 的 Timeout 有 unref，浏览器返回的是个数字 —— 探一下再调。
 *  作用见 startLive 里的注释：定时器绝不能 hold 住 Node 的事件循环。 */
function unrefIfPossible(t) {
    const x = t;
    if (x && typeof x.unref === "function")
        x.unref();
}
// ── 余额徽章 ─────────────────────────────────────────────────────────────
/* 徽章只在页面加载时查一次余额。上游偶发失败（实测：平台网关对
 * /api/credits/balance 间歇性 403）会让徽章永久定格在"余额查询失败"，
 * 而下一次请求往往就成功了——用户却只能手动刷整页。所以失败后自愈重查
 * （重查档位在 ctx.WALLET_RETRY_MS / WALLET_SETTLE_MS，见 ctx.ts）。
 *
 * ⚠️ 本文件里 `data`（钱包响应）、`rec`（充值配置）这些变量名是契约的一部分：
 * python 的 test_browser_contract.py 用变量名正则提取"浏览器读了哪些字段"，
 * 禁止改名。`esc(text)`/`safeUrl(rec.walletUrl)` 的书写形态被
 * scripts/mutate-escapes.sh 的变异靶逐字匹配，改动时两边同步。 */
function createWalletChip(ctx, api, recharge) {
    /* 这条 resource timing 是不是"页面在打自己的业务接口"。
     *
     * 三道判断，每一道都有反例：
     *   1. 必须落在 **ctx.apiBase** 上 —— 而不是"必须同源"。接入方可以把 apiBase
     *      指到独立的 API 域名，那时业务请求全是跨源的，写死同源会把它们全滤掉、
     *      活动驱动整个失效（而且是静默失效：功能像是没做）。apiBase 为空时它就是
     *      同源，这也是绝大多数接入方的情形。
     *   2. 路径要以 /api/ 开头 —— 静态资源、图片不算干活。
     *   3. **必须排除 /api/auth/** —— 徽章自己那次 /api/auth/wallet 同样是一条
     *      resource 条目，不排掉就是"刷新触发刷新"的自激死循环。
     * /api/billing/* 故意不排除：下单、查订单状态都强烈预示余额要变，刷一次正好。
     */
    function isBusinessApiCall(name) {
        try {
            const here = window.location.origin;
            const u = new URL(name, here);
            const base = new URL(ctx.apiBase || "/", here);
            if (u.origin !== base.origin)
                return false;
            const prefix = base.pathname.replace(/\/+$/, "");
            if (!u.pathname.startsWith(prefix + "/api/"))
                return false;
            if (u.pathname.startsWith(prefix + "/api/auth/"))
                return false;
            return true;
        }
        catch (_a) {
            return false;
        }
    }
    /* 代次（ctx.walletSeq）：每次"新一轮"挂载都作废在途的重试链。少了它会出竞态
     * ——用户充值成功后主动刷新徽章（见充值弹层轮询里的 mountWalletChip），
     * 旧重试链回来会用过期数据覆盖掉刚充上的余额。 */
    /**
     * @param tok 本站 token
     * @param o { attempt, awaitChangeFrom }
     *   awaitChangeFrom：充值前的余额指纹。查到的值仍等于它 = 钱还没入账，
     *   继续重查。**支付网关回 status=1 早于 portal 入账完成**，不等就会
     *   拿到旧值渲染上去，用户以为没充上（实测：¥0.01 到账 300 积分，
     *   但支付成功那一刻查到的还是充值前的数）。
     */
    /* 消耗侧自动刷新。
     *
     * 徽章原先只在两处刷新：页面加载、充值成功。用户跑一轮生成、积分被扣掉，数字
     * 一动不动直到手动刷新页面——而"扣了钱界面不变"最容易被当成没扣费，或者被当成
     * 充值没到账。SDK 看不见消耗（那发生在宿主服务端打网关时），所以这里靠周期性
     * 重问服务端；服务端那边只在真花过钱时才去上游查（node 包 core/spend-notice.ts），
     * 因此值钱的上游调用量约等于花钱次数，而不是这里的轮询次数。
     *
     * 两条纪律：
     *   1. 只在标签页可见时跑。后台标签挂一整天不该产生任何请求。
     *   2. 切回前台立刻补一次。隐藏期间很可能有过消耗，等下一个整间隔太迟。
     */
    /* 停掉消耗侧自动刷新（兜底 interval + 活动去抖 + PerformanceObserver）。
     * 除了 tick 自己发现徽章没了会调，还暴露给宿主：登出、或把 SDK 整个卸掉时
     * 得有办法停 —— 否则那些定时器永远挂着，对着一个不存在的徽章打请求
     * （SPA 里尤其明显，页面不卸载）。 */
    /* 只清定时器，**不动**已装好的监听/观察器。startLive 每次挂徽章都会被调到
     * （换一个新的兜底 interval），那时不能把 visibilitychange 和
     * PerformanceObserver 一起拆了重装 —— 装 N 遍的话切一次前台就并发打 N 个
     * 请求（这正是本包自己的测试抓到的一次回归）。 */
    function clearLiveTimers() {
        if (ctx.walletLiveTimer) {
            clearInterval(ctx.walletLiveTimer);
            ctx.walletLiveTimer = null;
        }
        if (ctx.walletActivityTimer) {
            clearTimeout(ctx.walletActivityTimer);
            ctx.walletActivityTimer = null;
        }
    }
    function stopWalletLive() {
        clearLiveTimers();
        if (ctx.walletActivityObserver) {
            try {
                ctx.walletActivityObserver.disconnect();
            }
            catch ( /* 断不掉也别炸 */_a) { /* 断不掉也别炸 */ }
            ctx.walletActivityObserver = null;
        }
        // 完整拆除才允许重置这个标志：下次挂徽章要重新装监听
        ctx.walletLiveWired = false;
    }
    function startLive(tok) {
        if (!ctx.WALLET_LIVE_MS)
            return;
        if (ctx.opts.wallet === false)
            return;
        /* fresh 的分界。
         *
         * 兜底那一路（fresh=false）是唯一允许吃服务端缓存的：它按固定间隔响，
         * 大多数时候什么都没变，让它命中缓存正是省下上游调用的地方。
         *
         * 其余两路（活动驱动、切回前台）都要真查：
         *   · 活动驱动 —— 刚花过钱，服务端也知道该重查，给缓存等于白刷一次；
         *   · 切回前台 —— 用户离开了一阵又回来，这期间很可能在别处充过值，
         *     而服务端缓存的判据只有"本站花过钱"，看不见充值。
         */
        const tick = function (fresh) {
            // 徽章被移除（登出、切成平台内嵌态）就自己停掉，别做无主的请求
            if (!document.getElementById("agentia-wallet-chip")) {
                stopWalletLive();
                return;
            }
            if (document.visibilityState === "hidden")
                return;
            // 不传 awaitChangeFrom：这是常规刷新，不是"等某个值变掉"。
            // 也不重置 walletSeq —— mountWalletChip 内部 attempt=0 会自增代次，
            // 从而作废在途的旧重试链，这正是我们要的。
            mountWalletChip(tok, { fresh: fresh });
        };
        clearLiveTimers();
        /* ── 兜底：固定间隔 ──────────────────────────────────────────────────
         * 默认 3 分钟。它不是主力，只盖活动检测的盲区（纯 SSE 驱动的工具、
         * 余额在别的工具或平台侧变化）。 */
        const timer = setInterval(function () { tick(false); }, ctx.WALLET_LIVE_MS);
        ctx.walletLiveTimer = timer;
        /* 定时器绝不能 hold 住事件循环。浏览器里没有这个概念（页面卸载就没了），
         * 但本包同样跑在 Node 下：接入方的测试套件、jsdom、SSR 预渲染。一个永不清除
         * 的 interval 会让 `node --test` 跑完之后**永远不退出** —— 实测本包自己的
         * 61 条既有测试就是这么挂住的，而且每个接入方的测试都会一起挂。
         * Node 的 Timeout 有 unref，浏览器返回的是个数字，所以要探一下再调。 */
        unrefIfPossible(timer);
        if (ctx.walletLiveWired)
            return;
        ctx.walletLiveWired = true;
        /* ── 切回前台补一次 ─────────────────────────────────────────────────
         * 隐藏期间发生的变化（在别处充值、别的标签页里花钱）等下一个兜底间隔太迟。
         * 只装一次：mountWalletChip 每刷新一次都会走到 startLive，装 N 次的话
         * 切一次前台就并发打 N 个请求。 */
        try {
            document.addEventListener("visibilitychange", function () {
                if (document.visibilityState === "visible")
                    tick(true);
            });
        }
        catch ( /* 拿不到 document 的宿主（测试/SSR）：其余机制照旧 */_a) { /* 拿不到 document 的宿主（测试/SSR）：其余机制照旧 */ }
        /* ── 主力：活动驱动 ─────────────────────────────────────────────────
         * 用 PerformanceObserver 观察页面自己在打同源业务接口，有动静才刷。
         * 页面静止时**一个请求都不发** —— 第一版做成固定 15 秒轮询，页面挂着
         * 没人动也在 4 次/分钟地打宿主接口，纯空转。
         *
         * 为什么这个信号站得住：resource timing 的条目是**响应结束时**才记录的，
         * 而扣费发生在服务端处理那次请求的过程中 —— 条目出现时钱已经扣完了，
         * 天然是个滞后信号，正是我们要的。
         *
         * 为什么不包 window.fetch：宿主通常已经包装过它（注入 token 那一层），
         * 再套一层有死锁风险 —— 本包的 ctx.origFetch 就是为了绕这个坑存在的。
         * PerformanceObserver 是旁观者，谁都不碰。
         *
         * 拿不到 PerformanceObserver（老浏览器 / SSR / 测试环境）就只剩兜底
         * interval —— 功能退化但不坏。 */
        if (!ctx.WALLET_ACTIVITY_GAP_MS)
            return;
        const PO = window.PerformanceObserver;
        if (typeof PO !== "function")
            return;
        const onActivity = function () {
            if (ctx.walletActivityTimer)
                return; // 已经排了一次，收敛成一发
            const since = Date.now() - ctx.walletActivityLastAt;
            const wait = Math.max(ctx.WALLET_ACTIVITY_DEBOUNCE_MS, ctx.WALLET_ACTIVITY_GAP_MS - since);
            const t = setTimeout(function () {
                ctx.walletActivityTimer = null;
                ctx.walletActivityLastAt = Date.now();
                tick(true);
            }, wait);
            ctx.walletActivityTimer = t;
            unrefIfPossible(t);
        };
        try {
            const obs = new PO(function (list) {
                const entries = list.getEntries();
                for (let i = 0; i < entries.length; i++) {
                    const e = entries[i];
                    if (e && isBusinessApiCall(e.name)) {
                        onActivity();
                        return;
                    }
                }
            });
            obs.observe({ type: "resource", buffered: false });
            ctx.walletActivityObserver = obs;
        }
        catch ( /* 某些环境不支持 type:"resource"：退回只有兜底 interval */_b) { /* 某些环境不支持 type:"resource"：退回只有兜底 interval */ }
    }
    function mountWalletChip(tok, o) {
        // wallet:false = 完全不要内置徽章（自己做 UI 的接入方）。放在这里而不是
        // 调用点，是因为 bootstrap 有三个分支会挂徽章，漏一个就等于开关没生效。
        // 注意它连请求都不发——只藏 DOM 的话，那次余额查询照样打出去了。
        if (ctx.opts.wallet === false)
            return Promise.resolve(null);
        // 兼容老写法 mountWalletChip(tok, 2)：第二个参数曾经是 attempt
        if (typeof o === "number")
            o = { attempt: o };
        const opt = o || {};
        const attempt = opt.attempt || 0;
        const awaitChangeFrom = opt.awaitChangeFrom == null ? null : opt.awaitChangeFrom;
        // 默认 true：显式挂徽章都是"用户正看着"的时刻，不能给缓存。
        // 服务端的缓存判据是"本站花过钱"，看不见充值 —— 不要 fresh 的话，充完值
        // 反复查到的都是充值前那份，徽章永远不变（2026-08-18 实测踩到）。
        const fresh = opt.fresh !== false;
        if (!attempt) {
            ctx.walletSeq++;
            if (ctx.walletRetryTimer) {
                clearTimeout(ctx.walletRetryTimer);
                ctx.walletRetryTimer = null;
            }
        }
        const mySeq = ctx.walletSeq;
        // 两种重查的节奏不同：等上游故障恢复要慢（别加压），等入账要快（用户在看）
        const delays = awaitChangeFrom == null ? ctx.WALLET_RETRY_MS : ctx.WALLET_SETTLE_MS;
        function scheduleRetry() {
            if (attempt >= delays.length)
                return;
            const delay = delays[attempt];
            if (delay == null)
                return;
            ctx.walletRetryTimer = setTimeout(function () {
                if (mySeq !== ctx.walletSeq)
                    return; // 期间已有新一轮，这条链作废
                mountWalletChip(tok, { attempt: attempt + 1, awaitChangeFrom: awaitChangeFrom, fresh: fresh });
            }, delay);
        }
        return api.getWallet(tok, fresh)
            .then(function (data) {
            if (mySeq !== ctx.walletSeq)
                return; // 已被新一轮挂载取代，丢弃这次结果
            // 三种"没数据"要分开对待，混为一谈就会白重试或该重试的不重试：
            //   1. 请求本身失败（data 为 null）→ 值得重试
            //   2. 通道未启用（enabled 为假）→ 重试多少次都一样，别打了
            //   3. 通道启用但查不到（unavailable）→ 正是要自愈的场景，见下方
            if (!data) {
                scheduleRetry();
                return;
            }
            if (!data.enabled)
                return;
            const existing = document.getElementById("agentia-wallet-chip");
            if (existing)
                existing.remove();
            const chip = document.createElement("div");
            chip.id = "agentia-wallet-chip";
            chip.style.cssText =
                "position:fixed;top:10px;right:10px;z-index:99980;display:flex;gap:10px;align-items:center;" +
                    "padding:5px 12px;border-radius:999px;background:rgba(30,26,22,.72);color:#fff;" +
                    "font:12px/1.6 system-ui,-apple-system,'PingFang SC',sans-serif;backdrop-filter:blur(6px);" +
                    "box-shadow:0 2px 10px rgba(0,0,0,.18)";
            // 两种通道的余额语义不同：云一是人民币，平台是积分
            let text;
            let degraded = false;
            const unit = coinUnitOf(data);
            if (data.unlimited)
                text = ctx.t("auth.balance_unlimited", "不限额");
            else if (typeof data.balanceCny === "number")
                text = "¥" + data.balanceCny.toFixed(2);
            else if (unit)
                text = unit.value;
            else if (typeof data.credits === "number")
                text = data.credits + ctx.t("auth.credits_unit", " 积分");
            else if (data.unavailable) {
                // 服务端查余额失败。**不能落到下面的空字符串**——那样徽章上只剩一个
                // "去充值"，用户既不知道自己有多少钱，也不知道这是查询挂了还是余额为 0，
                // 接入方更不知道该去搜什么日志。宁可显示得难看，也要显示得诚实。
                text = ctx.t("auth.balance_unavailable", "余额查询失败");
                degraded = true;
            }
            else
                text = data.username || "";
            const rec = data.recharge || {};
            let action = "";
            // walletUrl 同样来自上游（portal 的充值配置），过协议白名单再进 href
            const walletHref = safeUrl(rec.walletUrl);
            if (rec.mode === "redirect" && walletHref) {
                action =
                    '<a href="' + walletHref + '" target="_blank" rel="noreferrer" ' +
                        'style="color:#ffd9a0;text-decoration:none">' + ctx.t("auth.wallet_topup", "去充值") + "</a>";
            }
            else if (rec.mode === "inline") {
                // 站内充值：不跳走，交给宿主渲染下单弹层（后端已备好 /api/billing/order）
                action =
                    '<a href="#" id="agentia-topup" style="color:#ffd9a0;text-decoration:none">' +
                        ctx.t("auth.wallet_topup", "去充值") + "</a>";
            }
            // 退出入口只在**能真正登出**时给，判据是拿不拿得到上游 logout 端点。
            // 云一通道（YunyiBilling）返回 logoutUrl —— 用户确实在本站登录过，退出有
            // 明确语义，退完还能自己登回来。
            // 平台通道（AgentiaBilling）不返回 —— 身份是官宣入场时由平台注入的，不落
            // 本站 localStorage，本站根本没有"登录态"可退。真渲染出来点下去：clearStored
            // 清了个空、没有 logoutUrl 于是 replace("/") 把 URL 里的 token 一并丢掉，
            // 用户当场被另一套账号体系的登录门拦住，且无法自助回来（只能回平台官宣页
            // 重跳一次）。账号管理本就归平台外壳，工具侧不该插一脚。
            const logoutHtml = rec.logoutUrl
                ? '<a href="#" id="agentia-logout" style="color:#fff;opacity:.75;text-decoration:none">' +
                    ctx.t("auth.logout", "退出") + "</a>"
                : "";
            // text 在余额分支里是数字，但 else 分支是 data.username —— 那是 IdP 签发的
            // 字符串，统一转义，别指望"这个分支的值应该是安全的"
            // 降级态视觉上要能和真实余额区分开，否则"余额查询失败"混在正常样式里
            // 仍然容易被当成一个正常状态划过去。title 给接入方留排查线索。
            // 展示币前面挂一枚四角星，不写单位文字。
            // 为什么不写文字：币种名是**各环境各自配置**的，实测同一份代码在 dev
            // 拿到"积分"、在生产拿到"贝壳"——而这个数已经是贝壳数了，标成"积分"
            // 是错的。图标没有这个歧义，也正是平台自己的画法。
            // 名字仍然在数据层（wallet.coin.name）留着，宿主要文字可以自己取。
            const icon = !degraded && unit ? COIN_ICON : "";
            const textSpan = degraded
                ? '<span style="opacity:.75" title="' +
                    esc(ctx.t("auth.balance_unavailable_hint", "服务端查询余额失败，请查看服务端日志中的 [billing] 告警")) +
                    '">⚠ ' + esc(text) + "</span>"
                : "<span>" + icon + esc(text) + "</span>";
            chip.innerHTML = textSpan + action + logoutHtml;
            (document.body || document.documentElement).appendChild(chip);
            const topup = chip.querySelector("#agentia-topup");
            if (topup)
                topup.onclick = function (e) {
                    e.preventDefault();
                    // 宿主想自己做 UI 就覆盖；否则用 SDK 内置弹层（开箱可用）
                    if (typeof ctx.opts.onRecharge === "function")
                        ctx.opts.onRecharge(rec, data);
                    else
                        recharge.openRecharge(tok, rec, data);
                };
            const out = chip.querySelector("#agentia-logout");
            if (out)
                out.onclick = function (e) { e.preventDefault(); ctx.late.doLogout(rec.logoutUrl || ""); };
            // 徽章已经在页面上了 —— 从这一刻起让它自己跟着消耗走（见 startLive）。
            // 放在这里而不是函数开头：只有真渲染出徽章的那条路径才该起轮询，
            // enabled 为假、或请求失败时起轮询等于对着一个不存在的徽章打请求。
            startLive(tok);
            // 排在渲染之后：先让用户看到当前状态，别为了重查把界面空着。
            if (degraded) {
                // 查询失败：等上游恢复
                scheduleRetry();
            }
            else if (awaitChangeFrom != null && balanceKeyOf(data) === awaitChangeFrom) {
                // 充值到账延迟：值还没变，接着查。**注意不能等到变了才渲染**——
                // 万一一直不变（并发消费抵消、或到账真的很慢），界面总得有个数。
                scheduleRetry();
            }
        });
    }
    return { mountWalletChip: mountWalletChip, stopWalletLive: stopWalletLive };
}

/* 会话入口与来路管理：四个入场路径（portalExchange / mintAnon / bootstrap /
 * reauth）+ doLogout 全部收在本文件——ctx.sessionMode 的**全部写点**都在这里
 * （ctx.ts 的声明注释有此约定），scripts/mutate-freshness.sh 的 4 条会话保鲜
 * 不变量也按本文件路径做变异监护。 */
function createSession(ctx, config, storage, gate, transport, walletChip) {
    // ── 官宣入场（agentiaToken）─────────────────────────────────────────────
    /* 平台官宣页跳转 URL 带 ?agentiaToken=<用户 UC 凭证>。立刻换本站 token。
     *  - agentiaToken 是用户的完整平台凭证，必须第一时间从地址栏抹掉；
     *  - 换来的本站 token 存 sessionStorage（按标签页隔离，见 storage.ts），
     *    地址栏**什么都不留**。
     * 失败也抹掉，返回 ''：页面自然落回独立站启动路径（登录门/匿名）。
     *
     * 历史：原实现把地址栏改写成 `?token=<本站 token>`，让本次会话与既有平台注入态
     * 在 URL 上完全一致、页面其余逻辑零改动。代价是会话凭证长期停在地址栏上
     * （历史记录 / 截图 / 手动分享 / Referer / 服务端日志都得逐个去堵）。
     * 现在改成"搬进 sessionStorage"，两个约束（刷新不丢、不串号）仍然满足。 */
    function portalExchange(agentiaToken) {
        /* 清地址栏。parked=true 表示 token 已存进 sessionStorage，可以什么都不留；
         * false 是**回退**：存不进去（无痕模式等）就仍旧把它写回 ?token=，
         * 否则用户一刷新就掉登录态。 */
        function scrub(tok, parked) {
            try {
                const u = new URL(window.location.href);
                u.searchParams.delete("agentiaToken");
                u.searchParams.delete("token");
                if (tok && !parked)
                    u.searchParams.set("token", tok);
                history.replaceState(null, "", u.pathname + u.search + u.hash);
            }
            catch (_a) { }
        }
        return ctx.origFetch(ctx.url("/api/auth/portal-exchange"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentiaToken: agentiaToken }),
        })
            .then(function (res) {
            if (!res.ok)
                throw new Error("portal-exchange " + res.status);
            return res.json();
        })
            .then(function (data) {
            const tok = String(data.token || "");
            if (!tok)
                throw new Error("portal-exchange: 空 token");
            scrub(tok, storage.setPortalStored(tok));
            storage.setAuthToken(tok);
            // 只在**成功**时标来路。失败分支的既定行为是落回独立站启动路径
            // （登录门 / 匿名），若在函数入口就标上，失败后 reauth 会显示
            // "回平台重新打开"并藏掉登录按钮，把用户堵死在一条本来能走的路上。
            ctx.sessionMode = "portal";
            // 官宣入场要挂余额徽章：用户是从平台官宣页跳到**独立标签**来的，
            // 看不到平台自己的积分显示，所以工具侧必须给出余额和充值入口。
            // 注意这与 MCP 内嵌态不同——那种是工作台 iframe，平台外壳已有余额，
            // 工具再挂一个会重复（见 bootstrap 里 ?token= 分支不挂徽章）。
            walletChip.mountWalletChip(tok);
            return tok;
        })
            .catch(function (e) {
            console.warn("[agentia-auth] 官宣入场换取失败:", e instanceof Error ? e.message : e);
            scrub("", false);
            ctx.sessionMode = ""; // 明确交还给独立站路径，别让上一次的标记粘住
            return "";
        });
    }
    // ── 匿名（未启用账户系统时的开箱行为）───────────────────────────────────
    function mintAnon() {
        const path = ctx.opts.anonPath || "/api/session/start";
        return ctx.origFetch(ctx.url(path), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        })
            .then(function (res) { return res.ok ? res.json().catch(function () { return null; }) : null; })
            .then(function (data) {
            let minted = "";
            if (data && data.token)
                minted = String(data.token);
            else if (data && data.homepageUrl) {
                try {
                    minted = new URL(String(data.homepageUrl), window.location.origin)
                        .searchParams.get("token") || "";
                }
                catch (_a) { }
            }
            if (minted) {
                storage.setStored(minted, "anon");
                storage.setAuthToken(minted);
                storage.stripTokenFromUrl();
            }
            return minted;
        })
            .catch(function () { return ""; });
    }
    /* 把 post_logout_redirect_uri 拼到注销地址上。用 URL 而不是字符串拼接：
     * 注销地址本身可能已经带 query，手拼很容易出 `?a=1?b=2`。拼不动就原样返回
     * ——宁可这一次不回跳，也不能把地址改坏、让用户卡在一个 404 上。 */
    function withPostLogoutRedirect(logoutUrl, back) {
        try {
            const u = new URL(logoutUrl, window.location.origin);
            if (!u.searchParams.get("post_logout_redirect_uri")) {
                u.searchParams.set("post_logout_redirect_uri", back);
            }
            return u.href;
        }
        catch (_a) {
            return logoutUrl;
        }
    }
    // ── 登出 ────────────────────────────────────────────────────────────────
    /* 适用于**独立站登录态**（云一 OIDC）。平台注入态别调：那种身份不在本站
     * localStorage 里，清了也没用，末尾的 replace("/") 反而会把 URL 上的 token
     * 丢掉、把用户送进登录门。徽章已按 logoutUrl 的有无决定要不要给这个入口。 */
    function doLogout(logoutUrl) {
        // 两个通道都要取、都要清：独立站在 localStorage，平台注入态在 sessionStorage。
        // 只清 localStorage 的话，平台入场的用户点退出等于什么都没发生（本标签页里
        // sessionStorage 还在，刷新照样是登录态），而服务端那次撤销也拿不到 token。
        const tok = storage.getStored() || storage.getPortalStored();
        storage.clearStored();
        storage.clearPortalStored();
        // 记下「下一次登录必须重新认证」。这是不依赖上游注销的那条路：即使
        // logoutMode:"local"（完全不碰上游会话），用户下次点登录也会被要求重新输
        // 凭证，而不是被免密秒登回同一个账号。详见 storage.markForceReauth。
        storage.markForceReauth();
        // 先让服务端真的登出：撤销本站 token、清掉库里的上游凭证。
        // 只清 localStorage 是不够的——本站 token 在服务端仍有效到 TTL 自然到期
        // （通常 7 天），期间任何拿到它的人都能继续用，还能花用户的钱。
        // 这一步失败不阻断后续流程：本地已经清了，用户观感上就是退出了。
        // 走 authedJson 而不是自己拼 Authorization 头：生产 Kong 会拦掉带 Bearer 的
        // 请求（见 transport.ts 的 tokenTransport 说明）。这里漏掉的话，登出在生产是
        // **静默失败**的——本地清干净了、看起来退出了，服务端的 token 却还有效到
        // TTL 到期。
        const serverSide = tok
            ? transport.authedJson("/api/auth/logout", { method: "POST", token: tok })
                .then(function (d) { return (d && d.logoutUrl) || logoutUrl || ""; })
                .catch(function () { return logoutUrl || ""; })
            : Promise.resolve(logoutUrl || "");
        serverSide.then(function (upstream) {
            /* 默认**不做**上游注销（`logoutMode: "local"`），只清本站登录态。
             *
             * ── 为什么退出不通知提供方也能生效 ──────────────────────────────────
             * 「只清本站」原本是不成立的：提供方的会话 cookie 还在，用户点「登录」会被
             * **免密秒登**回同一个账号——退出看起来没生效，也没法换账号。所以早先必须做
             * RP-Initiated Logout（主窗口跳 end_session_endpoint）把上游会话也注销掉。
             *
             * 现在换成了另一条路：登出时打标记，下一次登录带 `prompt=login` 强制重新
             * 认证（见 storage.markForceReauth 与 gate.ts 的 reauthQuery）。云一网关实测
             * 认这个参数——收到后它跳自己的 /sign-in 并带上 reauth=1，出现账号选择。
             * 于是不碰上游会话也能保证「退出后必须重新认证」。
             *
             * ── 为什么默认改成不跳 ───────────────────────────────────────────────
             * 云一网关侧的建议。它声明的 end_session_endpoint 是 `/api/user/logout`，实测
             * **302 到 `/logout`（它自己的前端 SPA 路由）**，注销与回跳都由那个 SPA 完成。
             * 于是退出这条路上夹着一次 SPA 冷加载，用户中途会看到网关的页面——正是
             * 2026-08-18 反馈的那个问题（当时的弹窗实现更糟，已先改成主窗口跳转）。
             * 改成本地退出后，用户看到的就只是「点退出 → 回到本站登录页」，瞬间完成。
             *
             * ── 代价，切回去之前要清楚 ───────────────────────────────────────────
             * 1. **退出只对本站生效**：提供方会话没动，用户去同一提供方下的其它工具站
             *    仍是登录态。这是产品语义变化，不是实现细节。
             * 2. **我们持有的凭证在提供方侧仍然有效**（云一实测约 720h），因为它的
             *    discovery 里没有 revocation_endpoint，没有可用的主动吊销手段。原先那次
             *    end_session 调用某种程度上承担着这个作用。
             * 需要全局登出（共用电脑等场景）就显式配 `logoutMode: "redirect"` 切回来，
             * 那条路的实现完整保留、有测试覆盖。
             *
             * post_logout_redirect_uri 是标准参数（OIDC RP-Initiated Logout §2），云一实测
             * 认它（在它前端里做跳转，服务端 302 看不出来）。 */
            const back = ctx.opts.postLogoutRedirectUri || window.location.origin + "/";
            if (upstream && ctx.opts.logoutMode === "redirect") {
                window.location.replace(withPostLogoutRedirect(upstream, back));
                return;
            }
            window.location.replace("/");
        });
    }
    /* 接管平台注入的 token：搬进 sessionStorage，然后**把它从地址栏抹掉**。
     *
     * 为什么要搬：URL 上的 token 是完整的会话凭证（TTL 7 天、能花用户的积分）。
     * 留在地址栏就会进浏览器历史、被截图、被用户手动分享出去，
     * 而服务端日志、Referer 这些通道也都得逐个去堵。搬进 sessionStorage 之后
     * 地址栏干净了，且刷新不丢身份（按标签页隔离，不串号）—— 见 storage.ts 的说明。
     *
     * ⚠️ 存不进去就**不抹**，退回老行为。宁可少一层安全收益，也不能让用户一刷新
     * 就掉登录态（Safari 无痕、被 storage 策略拦住的 iframe 都会走到这条路上）。
     *
     * 徽章挂不挂看是不是在 iframe 里：
     *   · MCP 内嵌态（工作台 iframe）：平台外壳自己显示余额，工具再挂一个是重复；
     *   · 官宣入场：独立标签页，用户看不到任何平台外壳，必须自己挂。 */
    function adoptPortalToken(tok) {
        ctx.sessionMode = "portal";
        storage.setAuthToken(tok);
        if (storage.setPortalStored(tok))
            storage.stripTokenFromUrl();
        if (!storage.inIframe())
            walletChip.mountWalletChip(tok);
        return tok;
    }
    // ── 入口 ────────────────────────────────────────────────────────────────
    /* 决定 token 来路。返回 Promise<token>；进登录门/正在跳转时返回永不 resolve
     * 的 Promise（页面 fetch 包装器挂起等待，用户马上被导航走）。 */
    function bootstrap() {
        if (window.location.pathname === ctx.callbackPath)
            return gate.handleCallback();
        const params = new URLSearchParams(window.location.search);
        const agentiaToken = params.get("agentiaToken") || "";
        if (agentiaToken)
            return portalExchange(agentiaToken); // 来路由它按成败自行标记
        const urlToken = params.get("token") || "";
        // 平台注入态：URL token 不是本站存的 → 旁路，不换发
        if (urlToken && !storage.isStandaloneReturn(urlToken)) {
            return Promise.resolve(adoptPortalToken(urlToken));
        }
        /* 平台注入态的刷新 / 站内导航：地址栏已经抹干净了，token 在 sessionStorage 里。
         * 必须排在 localStorage 分支**之前**：这个标签页是平台为某个用户开的，
         * 它的身份优先于本机上残留的独立站登录态，否则刷新一下就变成另一个人。 */
        const parked = storage.getPortalStored();
        if (parked) {
            ctx.sessionMode = "portal";
            storage.setAuthToken(parked);
            if (!storage.inIframe())
                walletChip.mountWalletChip(parked);
            return Promise.resolve(parked);
        }
        const stored = storage.getStored();
        if (stored) {
            ctx.sessionMode = storage.getMode() || "yunyi";
            storage.setAuthToken(stored);
            storage.stripTokenFromUrl();
            if (storage.getMode() === "yunyi")
                walletChip.mountWalletChip(stored);
            return Promise.resolve(stored);
        }
        return config.fetchCfg().then(function (cfg) {
            if (cfg.enabled) {
                // ?sso=（宿主已在提供方登录）：跳过登录门直接发起 authorize，见 gate.maybeAutoLogin
                if (!gate.maybeAutoLogin(cfg))
                    gate.showGate(cfg);
                return new Promise(function () { });
            }
            if (!ctx.mintAnonAllowed)
                return "";
            ctx.sessionMode = "anon";
            return mintAnon();
        });
    }
    /* 存量 token 401 后的再认证。启用账户系统 → 清 token 回登录门；否则匿名换发。 */
    function reauth() {
        // 平台入场通道走不到登录门：本站 token 只存在于地址栏（有意不落
        // localStorage），浏览器手里没有任何可用来自助恢复的东西，而云一登录门
        // 会把用户换成另一套账号体系下的另一个人——之前的作品全都不在了。
        // SDK 早就认识到这条死路，所以平台注入态不渲染「退出」入口；但 token
        // 自然过期时同一条死路会自己发生，那里原本没有任何防护。
        //
        // 服务端已经做了滑动续期，正常使用不会走到这里；能走到说明是真的长期
        // 没用过（超过整个 TTL），此时唯一正确的出路就是回平台重新入场。
        if (ctx.sessionMode === "portal") {
            /* 死路的唯一出口：宿主自助恢复（见 types.ts 的 onPortalExpired）。
             * 顺序很讲究 ——
             *   ① 先取当前 token：它已经过期，但**是恢复的凭证之一**，清掉就没了；
             *      portal 态的 token 在 sessionStorage 里（clearStored 只动 localStorage，
             *      所以这里即使反了也拿得到，但别依赖那个巧合）；
             *   ② 再清本站登录态；
             *   ③ 最后才试恢复。恢复不成（没配钩子 / 返回空 / 抛错）落回原来的说明面板。 */
            const expiredToken = storage.currentToken();
            storage.clearStored();
            const showDeadEnd = () => {
                gate.showGate({}, ctx.t("auth.gate_expired_portal", "登录已过期，请回 AI 员工平台重新打开本工具"), { noLogin: true });
            };
            const onPortalExpired = ctx.opts.onPortalExpired;
            if (typeof onPortalExpired !== "function") {
                showDeadEnd();
                return new Promise(function () { });
            }
            return Promise.resolve()
                .then(function () { return onPortalExpired({ expiredToken: expiredToken }); })
                .catch(function () { return ""; })
                .then(function (fresh) {
                const tok = String(fresh || "").trim();
                if (!tok) {
                    showDeadEnd();
                    return new Promise(function () { });
                }
                // 仍然是平台注入态：不落 localStorage（同 origin 换用户会串号），
                // 只按标签页存 —— 与 bootstrap 里采纳 URL token 走同一条路。
                return adoptPortalToken(tok);
            });
        }
        storage.clearStored();
        return config.fetchCfg().then(function (cfg) {
            if (cfg.enabled) {
                // SSO 入场的标签页里 token 自然过期：同样先试静默重登（每标签页一次），
                // 免得从宿主站点长驻打开的页面隔天回来还要人再点一次「登录」
                if (!gate.maybeAutoLogin(cfg)) {
                    gate.showGate(cfg, ctx.t("auth.gate_expired", "登录已过期，请重新登录"));
                }
                return new Promise(function () { });
            }
            if (!ctx.mintAnonAllowed)
                return "";
            return mintAnon();
        });
    }
    return {
        portalExchange: portalExchange,
        mintAnon: mintAnon,
        doLogout: doLogout,
        bootstrap: bootstrap,
        reauth: reauth,
    };
}

/* 唯一的组装点。模块间是正向依赖链，仅有的两条回边（recharge→mountWalletChip、
 * wallet-chip→doLogout）走 ctx.late 槽位，在末尾覆写——别在这之前调它们。 */
function createClient(options) {
    const ctx = createCtx(options);
    const storage = createStorage(ctx);
    const config = createConfig(ctx);
    const transport = createTransport(ctx, storage);
    const api = createApi(transport);
    const gate = createGate(ctx, config, storage);
    const recharge = createRecharge(ctx, api);
    const walletChip = createWalletChip(ctx, api, recharge);
    const session = createSession(ctx, config, storage, gate, transport, walletChip);
    ctx.late.mountWalletChip = walletChip.mountWalletChip;
    ctx.late.doLogout = session.doLogout;
    return {
        bootstrap: session.bootstrap,
        reauth: session.reauth,
        isStandaloneReturn: storage.isStandaloneReturn,
        portalExchange: session.portalExchange,
        // ── 数据层：自己做 UI 就用这几个，不碰 DOM ──────────────────────────
        /* 给宿主的 fetch 包装器用：业务接口也会被生产 Kong 拦，SDK 只管得了自己
         * 发的请求。用法见 INTEGRATION.md §5「fetch 包装器」。 */
        withTokenQuery: transport.withTokenQuery,
        getWallet: api.getWallet,
        createOrder: api.createOrder,
        queryOrder: api.queryOrder,
        pollOrder: api.pollOrder,
        // ── 内置 UI：想用就用，传 wallet:false / onRecharge 可各自关掉 ──────
        mountWalletChip: walletChip.mountWalletChip,
        stopWalletLive: walletChip.stopWalletLive,
        openRecharge: function (options, balance) {
            return recharge.openRecharge(storage.getStored() || (window.__AGENTIA_AUTH__ && window.__AGENTIA_AUTH__.token) || "", options, balance);
        },
        closeRecharge: recharge.closeRecharge,
        getStored: storage.getStored,
        getMode: storage.getMode,
        clearStored: storage.clearStored,
        stripTokenFromUrl: storage.stripTokenFromUrl,
        logout: session.doLogout,
    };
}

export { STORE_KEY, createClient };
