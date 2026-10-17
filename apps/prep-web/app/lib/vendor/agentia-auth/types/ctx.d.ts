import type { AuthConfig, CreateClientOptions, MountWalletChipOptions, TFunc } from "./types";
export interface LateBindings {
    mountWalletChip: (tok: string, o?: MountWalletChipOptions | number) => Promise<null | void>;
    doLogout: (logoutUrl?: string) => void;
}
export interface Ctx {
    /** 原始选项：回调（onToken/onRecharge/…）与开关（wallet）在调用点实时读取 */
    opts: CreateClientOptions;
    apiBase: string;
    storeKey: string;
    modeKey: string;
    t: TFunc;
    origFetch: typeof fetch;
    callbackPath: string;
    mintAnonAllowed: boolean;
    /** 本站 token 的载体策略与"已降级到 query"标记，语义见 transport.ts 顶部注释 */
    tokenTransport: "auto" | "header" | "query";
    queryAuthStuck: boolean;
    /** /api/auth/config 的单飞缓存（见 config.ts） */
    cfgPromise: Promise<AuthConfig> | null;
    /** 登录门根元素（见 gate.ts） */
    gateEl: HTMLElement | null;
    sessionMode: string;
    /** 充值弹层根元素与在途轮询的 stop 函数（见 recharge.ts） */
    payEl: HTMLElement | null;
    pollTimer: (() => void) | null;
    /** 徽章重查的代次与在途定时器（见 wallet-chip.ts 的竞态说明） */
    walletSeq: number;
    walletRetryTimer: ReturnType<typeof setTimeout> | null;
    /** 兜底刷新间隔（ms）；0 = 消耗侧自动刷新整个关闭 */
    WALLET_LIVE_MS: number;
    /** 活动驱动刷新的最小间隔（ms）；0 = 只留兜底 interval */
    WALLET_ACTIVITY_GAP_MS: number;
    /** 观察到 API 活动后等多久再刷（把一串请求收敛成一次） */
    WALLET_ACTIVITY_DEBOUNCE_MS: number;
    /** 兜底定时器、活动去抖定时器、上次活动驱动刷新的时刻 */
    walletLiveTimer: ReturnType<typeof setInterval> | null;
    walletActivityTimer: ReturnType<typeof setTimeout> | null;
    walletActivityLastAt: number;
    /** 监听/观察器只该装一次（mountWalletChip 每刷新一次都会走到 startLive） */
    walletLiveWired: boolean;
    walletActivityObserver: {
        disconnect: () => void;
    } | null;
    /** 余额查询失败后的自愈重查档位 / 充值到账延迟的重查档位（见 wallet-chip.ts） */
    WALLET_RETRY_MS: number[];
    WALLET_SETTLE_MS: number[];
    late: LateBindings;
    url(path: string): string;
}
export declare function createCtx(options?: CreateClientOptions): Ctx;
//# sourceMappingURL=ctx.d.ts.map