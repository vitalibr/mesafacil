import { exactBounds } from '../engine/geom'
import { FLAT } from '../engine/solids'
import type { GeneratedPart, PartGeometry, PartInstance, PartKind } from '../engine/types'
import type { Solid } from './Viewer3D'

const KIND_COLOR: Record<PartKind, string> = {
  top: '#a7b0bb',
  sideLong: '#7b8794',
  sideShort: '#6e7a87',
  ribLongitudinal: '#5d82b8',
  ribTransverse: '#7a9bca',
  accessory: '#9aa6b2',
}

const ACCESSORY_COLORS = ['#a7b0bb', '#7b8794', '#5d82b8', '#5d82b8', '#8fa0b3']

interface Input {
  key: string
  name: string
  geometry: PartGeometry
  thickness: number
  placement: PartInstance
  color: string
}

function center(i: Input): [number, number, number] {
  const b = exactBounds(i.geometry.outer)
  const lx = (b.x0 + b.x1) / 2
  const ly = (b.y0 + b.y1) / 2
  const lz = i.thickness / 2
  const { origin: o, u, v, n } = i.placement
  return [0, 1, 2].map((k) => o[k] + lx * u[k] + ly * v[k] + lz * n[k]) as [number, number, number]
}

/** Vista explodida: cada peça se afasta do centro do conjunto. */
function withExplode(items: Input[], factor = 0.15): Solid[] {
  const cs = items.map(center)
  const mid = [0, 1, 2].map((k) => cs.reduce((s, c) => s + c[k], 0) / Math.max(1, cs.length))
  const span = Math.max(1, ...[0, 1, 2].map((k) => Math.max(...cs.map((c) => c[k])) - Math.min(...cs.map((c) => c[k]))))
  return items.map((it, i) => {
    const d = cs[i].map((c, k) => c - mid[k])
    const len = Math.hypot(...d)
    const dir = len > 1e-6 ? d.map((x) => x / len) : [0, 0, 1]
    return { ...it, explode: dir.map((x) => x * span * factor) as [number, number, number] }
  })
}

/**
 * Mesa explodida em camadas: laterais se afastam na horizontal, reforços
 * transversais sobem um pouco, longitudinais sobem mais (mostrando o encaixe
 * de meia altura) e o tampo fica no alto.
 */
export function tableSolids(parts: GeneratedPart[]): Solid[] {
  const items = parts.map((p) => ({ key: p.id, name: p.name, geometry: p.geometry, thickness: p.thickness, placement: p.placement, color: KIND_COLOR[p.kind] }))
  const cs = items.map(center)
  const top = parts.find((p) => p.kind === 'top')
  const tb = top ? exactBounds(top.geometry.outer) : { x0: 0, y0: 0, x1: 1, y1: 1 }
  const mid = [(tb.x0 + tb.x1) / 2, (tb.y0 + tb.y1) / 2]
  const depth = Math.max(100, ...cs.map((c) => -2 * c[2]))
  return items.map((it, i) => {
    const kind = parts[i].kind
    if (kind === 'top') return { ...it, explode: [0, 0, depth * 3] }
    if (kind === 'ribTransverse') return { ...it, explode: [0, 0, depth * 0.5] }
    if (kind === 'ribLongitudinal') return { ...it, explode: [0, 0, depth * 1.6] }
    if (kind === 'sideLong' || kind === 'sideShort') {
      const dx = cs[i][0] - mid[0]
      const dy = cs[i][1] - mid[1]
      const len = Math.hypot(dx, dy) || 1
      return { ...it, explode: [(dx / len) * depth, (dy / len) * depth, 0] }
    }
    return { ...it, explode: [0, 0, 0] }
  })
}

export function accessorySolids(parts: { id: string; name: string; geometry: PartGeometry; thickness: number; placement?: PartInstance }[]): Solid[] {
  return withExplode(parts.map((p, i) => ({ key: p.id, name: p.name, geometry: p.geometry, thickness: p.thickness, placement: p.placement ?? FLAT, color: ACCESSORY_COLORS[i % ACCESSORY_COLORS.length] })))
}
