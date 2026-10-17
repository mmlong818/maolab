import type { TransportApi } from "./transport";
import type { CreateOrderParams, OrderResult, PollOptions, WalletData } from "./types";
export declare function createApi(transport: TransportApi): {
    getWallet: (token?: string, fresh?: boolean) => Promise<WalletData | null>;
    createOrder: (params?: CreateOrderParams, token?: string) => Promise<OrderResult | null>;
    queryOrder: (orderNo: string, token?: string) => Promise<OrderResult | null>;
    pollOrder: (orderNo: string, o?: PollOptions) => () => void;
};
export type ApiApi = ReturnType<typeof createApi>;
//# sourceMappingURL=api.d.ts.map