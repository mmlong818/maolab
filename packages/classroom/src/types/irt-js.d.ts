declare module 'irt-js' {
  interface Zeta {
    a: number
    b: number
    c: number
  }

  export function estimateAbilityEAP(answers: number[], zeta: Zeta[]): number
  export function itemResponseFunction(zeta: Zeta, theta: number): number
  export function information(theta: number, a: number, b: number, c: number): number
}
