import type { Ctx } from "./ctx";
import type { ApiApi } from "./api";
import type { RechargeConfig, WalletData } from "./types";
export declare function createRecharge(ctx: Ctx, api: ApiApi): {
    openRecharge: (tok: string, options?: RechargeConfig | null, balance?: WalletData | null) => void;
    closeRecharge: () => void;
};
export type RechargeApi = ReturnType<typeof createRecharge>;
//# sourceMappingURL=recharge.d.ts.map