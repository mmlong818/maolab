/** i18n 函数：未构建型项目没有 i18n，退化成原文（见 ctx.ts 的默认实现）。 */
export type TFunc = (key: string, fallback?: string) => string;
/** /api/auth/config 的响应（公开信息：authority + client_id）。 */
export interface AuthConfig {
    enabled?: boolean;
    authority?: string;
    client_id?: string;
    authorization_endpoint?: string;
}
/** 展示币（贝壳）信息，语义见 coin.ts 的 coinUnitOf。 */
export interface CoinInfo {
    available?: number;
    /** false = 币种启用但汇率没配，available 是积分原值，**不能**当贝壳数显示 */
    converted?: boolean;
    name?: string;
    i18n?: Record<string, string>;
}
/** /api/auth/wallet 的响应。 */
export interface WalletData {
    enabled?: boolean;
    credits?: number | null;
    creditsFrozen?: number | null;
    balanceCny?: number | null;
    unlimited?: boolean;
    /** 服务端查余额失败（不是余额为 0），见 wallet-chip.ts 的降级渲染 */
    unavailable?: boolean;
    username?: string;
    coin?: CoinInfo | null;
    recharge?: RechargeConfig | null;
}
/** 套餐。price/discountedPrice 上游可能给字符串（实测），别假定 number。 */
export interface Plan {
    code: string;
    name?: string;
    price?: number | string;
    discountedPrice?: number | string;
    credits?: number;
    /** 展示币计价（0.5.0 起），有它就优先于 credits 显示 */
    coins?: number;
    currency?: string;
}
/** wallet.recharge：充值方式配置。 */
export interface RechargeConfig {
    mode?: "inline" | "redirect";
    plans?: Plan[];
    channels?: string[];
    globalChannels?: string[];
    priceRate?: {
        creditsPerYuan?: number;
    };
    walletUrl?: string;
    logoutUrl?: string;
}
/** 下单/查单响应。状态语义（照抄 portal）：1=支付成功 2=超时关闭 3=支付失败 4=已退款。 */
export interface OrderResult {
    orderNo?: string;
    payQrCode?: string;
    paymentUrl?: string;
    status?: number;
    error?: string;
}
/** 旧名，向后兼容（旧手写 d.ts 导出的是这个名字）。 */
export type OrderStatus = OrderResult;
export interface CreateOrderParams {
    channel?: string | undefined;
    planCode?: string;
    amount?: string;
    subject?: string;
}
export interface PollOptions {
    /** 下限 100ms 会静默改写传入值，语义见 api.ts 的 pollOrder 注释 */
    intervalMs?: number;
    maxTries?: number;
    token?: string | undefined;
    onTick?: (d: OrderResult) => void;
    onPaid?: (d: OrderResult) => void;
    onFailed?: (d: OrderResult) => void;
    /** 轮空 ≠ 支付失败：可能只是回调慢，措辞别写"支付失败"（钱可能已扣） */
    onTimeout?: () => void;
}
export interface MountWalletChipOptions {
    attempt?: number;
    /** 充值前的余额指纹（balanceKeyOf 产出）：查到的值仍等于它 = 钱还没入账，继续重查 */
    awaitChangeFrom?: string | null;
    /**
     * 是否要求服务端绕过缓存去上游真查。**默认 true** —— 显式挂徽章（页面加载、
     * 充值等到账、切回前台）都是"用户正看着"的时刻，必须是真值。
     * 只有后台那条常规轮询传 false，让缓存发挥省量作用。
     */
    fresh?: boolean;
}
export interface CreateClientOptions {
    /** 接口前缀（跨域时填完整 origin），末尾斜杠会被剥掉 */
    apiBase?: string;
    /** 本站 token 的 localStorage 键，默认 STORE_KEY */
    storageKey?: string;
    /** mode 的 localStorage 键。独立可配：迁移既有站点时两个 key 未必是派生关系 */
    modeKey?: string;
    /** OAuth 回调路径，默认 /callback */
    callbackPath?: string;
    appName?: string;
    logo?: string;
    scope?: string;
    t?: TFunc;
    /** 页面的 fetch 包装器可能 await 本模块返回的 Promise，传包装器会死锁——默认原生 fetch */
    fetch?: typeof fetch;
    onToken?: (token: string) => void;
    /** 宿主自己渲染充值 UI 时传入；不传则用内置弹层 */
    onRecharge?: (rec: RechargeConfig, data: WalletData) => void;
    onRecharged?: (d: OrderResult) => void;
    onRechargeFailed?: (d: OrderResult) => void;
    anonPath?: string;
    mintAnonAllowed?: boolean;
    /** 本站 token 的载体，默认 auto（撞 Kong 403 自动降级到 query），见 transport.ts */
    tokenTransport?: "auto" | "header" | "query";
    /**
     * 登出后回跳到哪。默认当前 origin 的 `/`。
     * 作为 OIDC 的 post_logout_redirect_uri 传给提供方，由它注销完送用户回来。
     */
    postLogoutRedirectUri?: string;
    /**
     * 登出模式，默认 `"local"`：只清本站登录态，不碰上游会话。退出瞬间完成。
     *
     * 「只清本站」能成立，靠的是 {@link reauthParams}（默认开启）—— 下一次登录带
     * `prompt=login` 强制重新认证，所以不会被免密秒登回原账号。云一网关实测认这个
     * 参数。这是网关侧建议的组合：不再往它的 end_session_endpoint 上跳（那个端点
     * 实测 302 到它自己的 SPA，加载慢、用户中途会看到网关的页面）。
     *
     * **两个代价，切之前要清楚：**
     * 1. **退出只对本站生效** —— 提供方会话没动，用户去同一提供方下的其它工具站
     *    仍是登录态。这是产品语义，不是实现细节。
     * 2. **我们持有的凭证在提供方侧仍然有效**（云一实测约 720h）—— 它没有
     *    revocation_endpoint，没有主动吊销手段。
     *
     * `"redirect"`：主窗口跳提供方的 end_session_endpoint（带
     * post_logout_redirect_uri），真注销上游会话再回到本站 —— 也就是**全局登出**。
     * 共用电脑等场景按产品口径显式配它。
     */
    logoutMode?: "redirect" | "local";
    /**
     * 登出之后的**下一次**登录，往 authorize 请求上追加哪些参数，默认
     * `{ prompt: "login" }`（OIDC Core §3.1.2.1：强制提供方重新认证，即使已有会话）。
     *
     * 只在登出后加，不是每次登录都加 —— 无条件加会把 SSO 的便利整个丢掉，用户每次
     * 本站 token 过期都得重输凭证，即使他在提供方那边还登着。
     *
     * `false` 或空对象 = 关掉这个机制（回到"只靠上游注销"）。
     *
     * ⚠️ 做成可配，是因为提供方**未必实现**它，而按 OIDC 规范提供方应当忽略不认识
     * 的参数 —— 也就是说不生效时**不会报错**，行为和以前完全一样。云一网关的
     * discovery 目前没有声明 `prompt_values_supported`，尚待其确认。真遇到不生效，
     * 换标准的等效手段即可：`{ max_age: "0" }`。
     */
    reauthParams?: Record<string, string> | false;
    /**
     * 静默单点登录入口的 URL 参数名，默认 `"sso"`；`false` = 关闭该机制。
     *
     * 场景：宿主站点已在同一提供方（云一网关）登录，外链/内嵌本工具时带上
     * `?sso=1`。此时未登录不再停在登录门等用户点「登录」，直接发起 authorize
     * —— 提供方侧已有会话就免密秒回，用户全程无感。提供方没有会话时表现与
     * 手动点「登录」完全一致（停在提供方的登录页），不会出错也不会循环。
     *
     * 防循环：每标签页只自动发起一次（sessionStorage 标记，换到 token 成功后
     * 清除）。用户在提供方页面中途放弃、按返回键回到带参数的 URL 时，第二次
     * 落回普通登录门，而不是又被弹走。
     *
     * 已登录（本地有 token）时该参数被无视 —— 判定点在「即将渲染登录门」处，
     * 不影响平台注入态 / agentiaToken / 匿名等其它入场路径。
     */
    ssoParam?: string | false;
    /**
     * 平台注入态的 token 过期时的**自助恢复**钩子。
     *
     * 为什么需要它：平台把工具的工作台 URL（含当时签发的本站 token）原样存进任务
     * 记录，用户日后从历史任务重新打开时，那个 token 往往早就过期了。而这里的登录门
     * 是条**死路** —— 点「登录」会走到提供方的账号体系下（另一套 externalId），
     * 变成另一个人，之前的作品一本都不在（见 session.ts reauth 的说明）。原行为是
     * 只能显示一句"回平台重新打开"，而用户恰恰就是从平台的任务记录点进来的。
     *
     * 宿主可以在这里用自己的办法换发一把新 token —— 典型做法是把地址栏里那个**已
     * 过期的 token** 连同一个业务作用域 id（会话/文档 id）一起交给自己的服务端，
     * 服务端双因素校验后签发新 token（过期 token 证明这条链接确实是平台当年发给
     * 这个用户的，作用域 id 把恢复钉死在这一份产物上）。
     *
     * 返回新 token → SDK 按平台注入态采纳并继续，用户无感；
     * 返回空 / 抛错 → 落回说明面板（无登录按钮），与不配置时一致。
     *
     * ⚠️ 拿到的 expiredToken 仍是**凭证**，只应发给自己的服务端。
     */
    onPortalExpired?: (info: {
        expiredToken: string;
    }) => string | void | Promise<string | void>;
    /** false = 完全不要内置徽章（连余额请求都不发） */
    wallet?: boolean;
    /** 余额查询失败后的自愈重查档位（ms）；false 或空数组 = 关闭 */
    walletRetryDelays?: number[] | false;
    /** 充值到账延迟的重查档位（ms）；false 或空数组 = 关闭 */
    walletSettleDelays?: number[] | false;
    /**
     * 消耗侧自动刷新的**兜底**间隔（ms），默认 180000（3 分钟）。
     * `false`/`0` = 关闭整个消耗侧自动刷新，回到"只在页面加载和充值成功时刷新"。
     *
     * 主力是活动驱动（见 walletActivityMinGapMs）：页面静止时一个请求都不发。
     * 兜底存在是为了盖住活动检测的两个盲区：纯 SSE/WebSocket 驱动的工具（进度走
     * 长连接、不产生新的 resource timing 条目）、以及余额在别处变化（同一账户在
     * 另一个工具花钱、或在平台侧充值）。
     */
    walletLiveMs?: number | false;
    /**
     * 活动驱动刷新的最小间隔（ms），默认 20000。`false`/`0` = 关掉活动驱动，
     * 只留兜底 interval。
     *
     * 机制：用 PerformanceObserver 观察页面自己打同源业务接口（排除 `/api/auth/*`，
     * 否则徽章自己那次请求会自激成死循环），有动静就去抖几秒后刷一次余额。
     * 不碰 window.fetch —— 宿主通常已经包装过它，再套一层有死锁风险。
     *
     * 为什么这个信号站得住：resource timing 的条目是**响应结束时**才记录的，
     * 而扣费发生在服务端处理那次请求的过程中 —— 所以条目出现时钱已经扣完了，
     * 是个天然的滞后信号。
     */
    walletActivityMinGapMs?: number | false;
}
export interface AuthClient {
    /** 决定 token 来路。进登录门/正在跳转时返回永不 resolve 的 Promise */
    bootstrap(): Promise<string>;
    /** 存量 token 401 后的再认证 */
    reauth(): Promise<string>;
    isStandaloneReturn(urlToken: string): boolean;
    portalExchange(agentiaToken: string): Promise<string>;
    withTokenQuery(u: string, tok?: string): string;
    getWallet(token?: string): Promise<WalletData | null>;
    createOrder(params?: CreateOrderParams, token?: string): Promise<OrderResult | null>;
    queryOrder(orderNo: string, token?: string): Promise<OrderResult | null>;
    /** 返回 stop 函数，关闭 UI 时务必调用，否则轮询在后台跑 */
    pollOrder(orderNo: string, o?: PollOptions): () => void;
    mountWalletChip(tok: string, o?: MountWalletChipOptions | number): Promise<null | void>;
    /**
     * 停掉消耗侧自动刷新。登出或把 SDK 整个卸掉时调 —— SPA 里页面不卸载，
     * 不停的话那个 interval 会一直对着不存在的徽章打请求。
     */
    stopWalletLive(): void;
    openRecharge(options?: RechargeConfig | null, balance?: WalletData | null): void;
    closeRecharge(): void;
    getStored(): string;
    getMode(): string;
    clearStored(): void;
    stripTokenFromUrl(): void;
    logout(logoutUrl?: string): void;
}
//# sourceMappingURL=types.d.ts.map