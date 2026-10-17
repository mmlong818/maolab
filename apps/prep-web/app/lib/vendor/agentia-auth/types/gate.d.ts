import type { Ctx } from "./ctx";
import type { ConfigApi } from "./config";
import type { StorageApi } from "./storage";
import type { AuthConfig } from "./types";
export declare function createGate(ctx: Ctx, config: ConfigApi, storage: StorageApi): {
    showGate: (cfg: AuthConfig, message?: string, o?: {
        busy?: boolean;
        noLogin?: boolean;
    }) => void;
    handleCallback: () => Promise<string>;
    maybeAutoLogin: (cfg: AuthConfig) => boolean;
};
export type GateApi = ReturnType<typeof createGate>;
//# sourceMappingURL=gate.d.ts.map