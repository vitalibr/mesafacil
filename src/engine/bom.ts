import { exactBounds, exactSignedArea, netArea } from './geom'
import type { BomItem, GeneratedPart, PartGeometry, PartKind, Point, Polygon } from './types'

export const KIND_LABEL: Record<PartKind, string> = {
  top: 'Tampo',
  sideLong: 'Lateral longa',
  sideShort: 'Lateral curta',
  ribLongitudinal: 'Reforço longitudinal',
  ribTransverse: 'Reforço transversal',
  accessory: 'Acessório',
}

const KIND_FILE: Record<PartKind, string> = {
  top: 'Tampo',
  sideLong: 'Lateral_Longa',
  sideShort: 'Lateral_Curta',
  ribLongitudinal: 'Reforco_Longitudinal',
  ribTransverse: 'Reforco_Transversal',
  accessory: 'Acessorio',
}

const KIND_ORDER: PartKind[] = ['top', 'sideLong', 'sideShort', 'ribLongitudinal', 'ribTransverse']

/** Arredondamento usado só para comparar geometrias (1 µm). */
const fmt = (v: number) => (Math.round(v * 1000) / 1000 + 0).toFixed(3)

type Transform = (p: Point) => Point

function canonicalPolygon(poly: Polygon, t: Transform, mirrored: boolean): string {
  // espelhar inverte o sentido dos arcos
  let pts = poly.map((p) => ({ ...t(p), bulge: (p.bulge ?? 0) * (mirrored ? -1 : 1) }))
  if (exactSignedArea(pts) < 0) {
    // ao inverter o sentido, o arco de cada segmento passa ao vértice seguinte, com sinal trocado
    const n = pts.length
    pts = pts.map((_, i) => {
      const q = pts[n - 1 - i]
      const prev = pts[(2 * n - 2 - i) % n]
      return { x: q.x, y: q.y, bulge: -(prev.bulge ?? 0) }
    })
  }
  let start = 0
  const key = (p: Point) => [Math.round(p.x * 1000), Math.round(p.y * 1000)] as const
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = key(pts[i])
    const [bx, by] = key(pts[start])
    if (ax < bx || (ax === bx && ay < by)) start = i
  }
  const rotated = [...pts.slice(start), ...pts.slice(0, start)]
  return rotated.map((p) => `${fmt(p.x)},${fmt(p.y)}${p.bulge ? `,b${fmt(p.bulge)}` : ''}`).join(' ')
}

/**
 * Assinatura geométrica da peça, independente da posição e da face: chapas
 * cortadas a laser podem ser viradas, então espelhamentos e rotação de 180°
 * da mesma geometria são considerados a mesma peça.
 */
export function geometrySignature(g: PartGeometry, thickness: number): string {
  const b = exactBounds(g.outer)
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const transforms: [Transform, boolean][] = [
    [(p) => ({ x: p.x - b.x0, y: p.y - b.y0 }), false],
    [(p) => ({ x: b.x1 - p.x, y: p.y - b.y0 }), true],
    [(p) => ({ x: p.x - b.x0, y: b.y1 - p.y }), true],
    [(p) => ({ x: b.x1 - p.x, y: b.y1 - p.y }), false],
  ]
  const variants = transforms.map(([t, mirrored]) => {
    const outer = canonicalPolygon(g.outer, t, mirrored)
    const holes = g.holes
      .map((c) => {
        const p = t(c)
        return `${fmt(p.x)},${fmt(p.y)},${fmt(c.r)}`
      })
      .sort()
      .join(';')
    const cutouts = g.cutouts
      .map((c) => canonicalPolygon(c, t, mirrored))
      .sort()
      .join('|')
    return `${outer}#${holes}#${cutouts}`
  })
  variants.sort()
  return `t${fmt(thickness)}|${fmt(w)}x${fmt(h)}|${variants[0]}`
}

/** Move a geometria para que a caixa envolvente comece em (0, 0). */
export function normalizeGeometry(g: PartGeometry): PartGeometry {
  const b = exactBounds(g.outer)
  const m = (p: Point): Point => (p.bulge ? { x: p.x - b.x0, y: p.y - b.y0, bulge: p.bulge } : { x: p.x - b.x0, y: p.y - b.y0 })
  return {
    outer: g.outer.map(m),
    holes: g.holes.map((c) => ({ x: c.x - b.x0, y: c.y - b.y0, r: c.r })),
    cutouts: g.cutouts.map((c) => c.map(m)),
  }
}

/** Agrupa peças de geometria idêntica (na ordem em que aparecem). */
export function groupIdentical<T extends { geometry: PartGeometry; thickness: number }>(parts: T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const p of parts) {
    const sig = geometrySignature(p.geometry, p.thickness)
    const list = groups.get(sig)
    if (list) list.push(p)
    else groups.set(sig, [p])
  }
  return [...groups.values()]
}

/** Nome de arquivo sem acentos, espaços ou caracteres problemáticos. */
export function fileSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/°/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Agrupa peças de geometria idêntica e numera a lista de peças. */
export function buildBom(parts: GeneratedPart[]): BomItem[] {
  const items: BomItem[] = []
  let seq = 1
  for (const kind of KIND_ORDER) {
    const list = groupIdentical(parts.filter((q) => q.kind === kind))
    list.forEach((group, gi) => {
      const first = group[0]
      const suffix = list.length > 1 ? String.fromCharCode(65 + (gi % 26)) + (gi >= 26 ? String(Math.floor(gi / 26)) : '') : ''
      const code = String(seq++).padStart(2, '0')
      const geometry = normalizeGeometry(first.geometry)
      const b = exactBounds(geometry.outer)
      items.push({
        code,
        description: suffix ? `${KIND_LABEL[kind]} ${suffix}` : KIND_LABEL[kind],
        kind,
        quantity: group.length,
        length: b.x1 - b.x0,
        height: b.y1 - b.y0,
        thickness: first.thickness,
        fileName: `${code}_${KIND_FILE[kind]}${suffix ? '_' + suffix : ''}.dxf`,
        holeCount: geometry.holes.length,
        netArea: netArea(geometry),
        partIds: group.map((p) => p.id),
        geometry,
      })
    })
  }
  return items
}
