import type { Ctx } from "./ctx";
import type { StorageApi } from "./storage";
export interface AuthedJsonInit {
    method?: string | undefined;
    body?: unknown;
    token?: string | undefined;
}
export declare function createTransport(ctx: Ctx, storage: StorageApi): {
    withTokenQuery: (u: string, tok?: string) => string;
    authedJson: <T = unknown>(path: string, init?: AuthedJsonInit) => Promise<T | null>;
};
export type TransportApi = ReturnType<typeof createTransport>;
//# sourceMappingURL=transport.d.ts.map