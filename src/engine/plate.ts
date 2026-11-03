import type { PartInstance, Polygon, Rect, Vec3 } from './types'

/** Recurso na borda de uma chapa vertical, no intervalo [a, b] ao longo do comprimento. */
export interface EdgeFeature {
  a: number
  b: number
  /** Aba sobressai da borda; entalhe entra na chapa. */
  kind: 'tab' | 'notch'
  depth: number
}

/**
 * Contorno de uma chapa vertical (lateral ou reforço) em coordenadas locais:
 * x ao longo do comprimento (0..length), y na altura (0 = borda inferior,
 * height = borda superior, encostada sob o tampo). As abas da borda superior
 * sobem de y = height até y = height + depth.
 *
 * Os recursos de cada borda não podem se sobrepor nem tocar as extremidades;
 * isso é garantido pelo gerador e conferido depois por validatePartGeometry.
 */
/** Aba numa extremidade da chapa, entre as alturas y0 e y1, saindo `depth` além da ponta. */
export interface EndTab {
  y0: number
  y1: number
  depth: number
}

export function verticalPlateOutline(
  length: number,
  height: number,
  top: EdgeFeature[],
  bottom: EdgeFeature[],
  ends: { start?: EndTab; end?: EndTab } = {},
): Polygon {
  const pts: Polygon = [{ x: 0, y: 0 }]
  for (const f of [...bottom].sort((p, q) => p.a - q.a)) {
    // na borda inferior só existem entalhes (sobem para dentro da chapa)
    pts.push({ x: f.a, y: 0 }, { x: f.a, y: f.depth }, { x: f.b, y: f.depth }, { x: f.b, y: 0 })
  }
  pts.push({ x: length, y: 0 })
  if (ends.end) {
    const e = ends.end
    pts.push({ x: length, y: e.y0 }, { x: length + e.depth, y: e.y0 }, { x: length + e.depth, y: e.y1 }, { x: length, y: e.y1 })
  }
  pts.push({ x: length, y: height })
  for (const f of [...top].sort((p, q) => q.a - p.a)) {
    const y = f.kind === 'tab' ? height + f.depth : height - f.depth
    pts.push({ x: f.b, y: height }, { x: f.b, y }, { x: f.a, y }, { x: f.a, y: height })
  }
  pts.push({ x: 0, y: height })
  if (ends.start) {
    const e = ends.start
    pts.push({ x: 0, y: e.y1 }, { x: -e.depth, y: e.y1 }, { x: -e.depth, y: e.y0 }, { x: 0, y: e.y0 })
  }
  return pts
}

/** Transforma um ponto local (s ao longo de u, w ao longo de n) para o plano XY do mundo. */
function toWorldXY(p: PartInstance, s: number, w: number): [number, number] {
  return [p.origin[0] + s * p.u[0] + w * p.n[0], p.origin[1] + s * p.u[1] + w * p.n[1]]
}

/**
 * Retângulo na vista superior ocupado pelo trecho [a, b] de uma chapa vertical
 * de espessura t, ampliado de `grow` em todas as direções.
 */
export function plateRectXY(p: PartInstance, a: number, b: number, t: number, grow = 0): Rect {
  const [x0, y0] = toWorldXY(p, a - grow, -grow)
  const [x1, y1] = toWorldXY(p, b + grow, t + grow)
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }
}

export function verticalPlacement(label: string, origin: Vec3, along: 'x' | 'y'): PartInstance {
  return along === 'x'
    ? { label, origin, u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] }
    : { label, origin, u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] }
}

/** Área ocupada por uma chapa vertical na vista superior (derivada da própria peça). */
export function partFootprint(part: { kind: string; geometry: { outer: { x: number }[] }; placement: PartInstance; thickness: number }): Rect | null {
  if (part.kind === 'top') return null
  let x0 = Infinity
  let x1 = -Infinity
  for (const p of part.geometry.outer) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x)
  }
  return plateRectXY(part.placement, x0, x1, part.thickness)
}
