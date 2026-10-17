import type { Ctx } from "./ctx";
import type { ConfigApi } from "./config";
import type { StorageApi } from "./storage";
import type { GateApi } from "./gate";
import type { TransportApi } from "./transport";
import type { WalletChipApi } from "./wallet-chip";
export declare function createSession(ctx: Ctx, config: ConfigApi, storage: StorageApi, gate: GateApi, transport: TransportApi, walletChip: WalletChipApi): {
    portalExchange: (agentiaToken: string) => Promise<string>;
    mintAnon: () => Promise<string>;
    doLogout: (logoutUrl?: string) => void;
    bootstrap: () => Promise<string>;
    reauth: () => Promise<string>;
};
export type SessionApi = ReturnType<typeof createSession>;
//# sourceMappingURL=session.d.ts.map