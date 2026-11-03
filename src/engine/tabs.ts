import { EPS } from './geom'

export interface Interval {
  a: number
  b: number
}

export interface TabPlacementInput {
  /** Comprimento da borda superior da peça. */
  length: number
  tabWidth: number
  /** Distância máxima desejada entre centros de abas. */
  spacing: number
  endDistance: number
  /** Distância mínima entre rasgos de abas vizinhas no tampo. */
  minGap: number
  /** Passo da busca por uma posição livre em torno da posição ideal. */
  step?: number
  /** Retorna null quando a aba [a, b] pode ser usada, ou o motivo da recusa. */
  check: (a: number, b: number) => string | null
}

export interface TabPlacementResult {
  tabs: Interval[]
  /** Peça curta demais para receber abas respeitando a distância das extremidades. */
  tooShort: boolean
  /** Motivos de recusa das abas que não puderam ser posicionadas. */
  failures: string[]
}

/**
 * Distribui abas uniformemente na borda superior da peça. Quando a posição
 * ideal de uma aba interfere com furos ou outros recortes, procura a posição
 * livre mais próxima, sem invadir a metade do intervalo até as abas vizinhas.
 */
export function placeTabs(input: TabPlacementInput): TabPlacementResult {
  const { length, tabWidth: w, spacing, endDistance, minGap, check } = input
  const step = input.step ?? 0.5
  const lo = endDistance + w / 2
  const hi = length - endDistance - w / 2
  if (hi < lo - EPS) return { tabs: [], tooShort: true, failures: [] }

  const span = Math.max(0, hi - lo)
  // nunca mais abas do que cabem com o vão mínimo entre rasgos vizinhos
  const nMax = Math.floor(span / (w + minGap) + EPS) + 1
  const n = nMax <= 1 ? 1 : Math.min(nMax, Math.max(2, Math.ceil(span / spacing - EPS) + 1))
  const pitch = n > 1 ? span / (n - 1) : 0
  const ideal0 = n > 1 ? lo : (lo + hi) / 2
  const window = n > 1 ? pitch / 2 - w / 2 : (hi - lo) / 2

  const tabs: Interval[] = []
  const failures: string[] = []
  for (let i = 0; i < n; i++) {
    const ideal = ideal0 + i * pitch
    let placed = false
    let firstReason: string | null = null
    const kMax = Math.max(0, Math.floor(window / step))
    for (let k = 0; k <= kMax && !placed; k++) {
      for (const sign of k === 0 ? [1] : [1, -1]) {
        const c = ideal + sign * k * step
        if (c < lo - EPS || c > hi + EPS) continue
        const a = c - w / 2
        const b = c + w / 2
        const prev = tabs[tabs.length - 1]
        if (prev && a - prev.b < minGap - EPS) continue
        const reason = check(a, b)
        if (reason === null) {
          tabs.push({ a, b })
          placed = true
          break
        }
        firstReason ??= reason
      }
    }
    if (!placed) failures.push(firstReason ?? 'spacing')
  }
  return { tabs, tooShort: false, failures }
}
