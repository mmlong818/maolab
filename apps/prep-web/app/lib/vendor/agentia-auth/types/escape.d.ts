export declare function esc(v: unknown): string;
/**
 * 要放进 href/src 的值。光转义不够——`javascript:alert(1)` 里一个特殊字符都
 * 没有，转义完原样通过，点一下照样执行。必须先过协议白名单。
 * 放行 http/https（收银台 URL）、data:image（二维码图）、weixin:（唤起微信），
 * 其余一律返回空串（调用方据此不渲染链接）。
 */
export declare function safeUrl(v: unknown): string;
//# sourceMappingURL=escape.d.ts.map