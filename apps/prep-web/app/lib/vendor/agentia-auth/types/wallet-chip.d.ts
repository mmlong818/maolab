import type { Ctx } from "./ctx";
import type { ApiApi } from "./api";
import type { RechargeApi } from "./recharge";
import type { MountWalletChipOptions } from "./types";
export declare function createWalletChip(ctx: Ctx, api: ApiApi, recharge: RechargeApi): {
    mountWalletChip: (tok: string, o?: MountWalletChipOptions | number) => Promise<null | void>;
    stopWalletLive: () => void;
};
export type WalletChipApi = ReturnType<typeof createWalletChip>;
//# sourceMappingURL=wallet-chip.d.ts.map