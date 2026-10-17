import type { Ctx } from "./ctx";
export declare function createStorage(ctx: Ctx): {
    getStored: () => string;
    getMode: () => string;
    setStored: (tok: string, mode: string) => void;
    clearStored: () => void;
    isStandaloneReturn: (urlToken: string) => boolean;
    inIframe: () => boolean;
    getPortalStored: () => string;
    setPortalStored: (tok: string) => boolean;
    clearPortalStored: () => void;
    markForceReauth: () => void;
    needsForceReauth: () => boolean;
    clearForceReauth: () => void;
    markSsoTried: () => void;
    ssoTriedOnce: () => boolean;
    clearSsoTried: () => void;
    stripTokenFromUrl: () => void;
    setAuthToken: (tok: string) => void;
    currentToken: () => string;
};
export type StorageApi = ReturnType<typeof createStorage>;
//# sourceMappingURL=storage.d.ts.map