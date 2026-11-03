import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './defaults'
import { generateProject } from './generate'
import { partFootprint } from './plate'
import { placementMatrix } from './solids'
import type { GeneratedPart } from './types'

/** Aplica a matriz (colunas) a um ponto local. */
function apply(m: number[], x: number, y: number, z: number) {
  return [0, 1, 2].map((k) => m[k] * x + m[4 + k] * y + m[8 + k] * z + m[12 + k])
}

/** Caixa no mundo dos 8 cantos do corpo da chapa (sem abas). */
function worldBox(p: GeneratedPart) {
  const xs = p.geometry.outer.filter((q) => q.y === 0).map((q) => q.x)
  const [x0, x1] = [Math.min(...xs, 0), Math.max(...xs)]
  const ys = p.geometry.outer.map((q) => q.y)
  const m = placementMatrix(p.placement)
  const pts = [x0, x1].flatMap((x) => [Math.min(...ys), p.kind === 'top' ? Math.max(...ys) : Math.max(...ys.filter((y) => y <= 1000))].flatMap((y) => [0, p.thickness].map((z) => apply(m, x, y, z))))
  return [0, 1, 2].map((k) => [Math.min(...pts.map((q) => q[k])), Math.max(...pts.map((q) => q[k]))])
}

describe('posições 3D derivadas das mesmas peças', () => {
  it('tampo ocupa 0..espessura em Z e laterais/reforços ficam abaixo, dentro da vista superior', () => {
    const c = createDefaultConfig()
    c.sides.enabled = true
    c.ribs.enabled = true
    const p = generateProject(c)
    const top = worldBox(p.parts.find((q) => q.kind === 'top')!)
    expect(top).toEqual([[0, 1200], [0, 800], [0, 6]])
    for (const part of p.parts.filter((q) => q.kind !== 'top')) {
      const b = worldBox(part)
      const fp = partFootprint(part)!
      // planta igual à da vista superior (ignorando as abas das pontas, que não existem aqui)
      expect(b[0][0]).toBeCloseTo(fp.x0)
      expect(b[0][1]).toBeCloseTo(fp.x1)
      expect(b[1][0]).toBeCloseTo(fp.y0)
      expect(b[1][1]).toBeCloseTo(fp.y1)
      // corpo abaixo do tampo, encostado na face inferior (Z = 0); abas sobem até a face de cima
      expect(b[2][0]).toBeLessThan(0)
      const zMax = Math.max(...part.geometry.outer.map((q) => apply(placementMatrix(part.placement), q.x, q.y, 0)[2]))
      expect(zMax).toBeCloseTo(part.geometry.outer.length > 4 ? 6 : 0)
    }
  })
})
