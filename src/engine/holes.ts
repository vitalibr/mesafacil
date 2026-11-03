import { EPS } from './geom'

/**
 * Posições dos centros dos furos ao longo de um eixo, modo automático:
 * cabe o maior número de furos com centro a pelo menos `minMargin` das duas
 * bordas, e a malha é centralizada.
 *
 * Exemplo de referência: 1200 mm, passo 50, margem 25 → 24 furos de 25 a 1175.
 */
export function autoGridPositions(length: number, pitch: number, minMargin: number): number[] {
  const span = length - 2 * minMargin
  if (!(pitch > 0) || span < -EPS) return []
  const n = Math.floor(span / pitch + EPS) + 1
  const first = (length - (n - 1) * pitch) / 2
  return Array.from({ length: n }, (_, i) => first + i * pitch)
}

/**
 * Modo manual: o primeiro centro fica em `start` e os seguintes avançam pelo
 * passo enquanto o centro ficar a pelo menos `endMargin` da borda oposta.
 */
export function manualGridPositions(length: number, pitch: number, start: number, endMargin: number): number[] {
  const span = length - start - endMargin
  if (!(pitch > 0) || span < -EPS) return []
  const n = Math.floor(span / pitch + EPS) + 1
  return Array.from({ length: n }, (_, i) => start + i * pitch)
}

/** Pontos médios entre posições consecutivas: os vãos livres entre linhas de furos. */
export function gapMidpoints(positions: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < positions.length; i++) out.push((positions[i] + positions[i + 1]) / 2)
  return out
}
