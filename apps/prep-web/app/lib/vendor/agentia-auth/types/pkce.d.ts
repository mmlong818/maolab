export interface Pkce {
    verifier: string;
    challenge: string;
}
export declare function randHex(bytes: number): string;
export declare function b64urlFromBytes(bytes: ArrayBuffer | Uint8Array): string;
/** 返回 {verifier, challenge}；只有连 CSPRNG 都没有时才 resolve(null)。 */
export declare function makePkce(): Promise<Pkce | null>;
//# sourceMappingURL=pkce.d.ts.map