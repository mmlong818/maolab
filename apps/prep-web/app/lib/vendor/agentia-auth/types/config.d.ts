import type { Ctx } from "./ctx";
import type { AuthConfig } from "./types";
export declare function createConfig(ctx: Ctx): {
    fetchCfg: () => Promise<AuthConfig>;
};
export type ConfigApi = ReturnType<typeof createConfig>;
//# sourceMappingURL=config.d.ts.map