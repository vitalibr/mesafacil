import type { PartInstance } from './types'

/**
 * Matriz 4 × 4 (colunas, como Three.js) que leva o ponto local (x, y, z) da
 * chapa para o mundo: origin + x·u + y·v + z·n, onde z é a espessura.
 * É a mesma posição usada na vista superior; nenhuma regra é duplicada.
 */
export function placementMatrix(p: PartInstance): number[] {
  const [u, v, n, o] = [p.u, p.v, p.n, p.origin]
  return [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, o[0], o[1], o[2], 1]
}

export const FLAT: PartInstance = { label: 'Deitada', origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }
