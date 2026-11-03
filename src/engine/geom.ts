import type { Circle, PartGeometry, Point, Polygon, Rect } from './types'

/** Tolerância para comparações geométricas (mm). */
export const EPS = 1e-6

export function rectPolygon(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]
}

export function signedArea(poly: Polygon): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export function polygonBounds(poly: Polygon): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of poly) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

export function rectToPolygon(r: Rect): Polygon {
  return rectPolygon(r.x0, r.y0, r.x1, r.y1)
}

export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function distPointSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Menor distância entre o ponto e o contorno do polígono. */
export function distPointPolygonEdge(p: Point, poly: Polygon): number {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) {
    d = Math.min(d, distPointSegment(p, poly[i], poly[(i + 1) % poly.length]))
  }
  return d
}

function orient(a: Point, b: Point, c: Point): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  return Math.abs(v) < EPS ? 0 : Math.sign(v)
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPS
  )
}

/** true se os segmentos se tocam ou se cruzam (inclui extremidades e colinearidade). */
export function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(a, b, c)) return true
  if (o2 === 0 && onSegment(a, b, d)) return true
  if (o3 === 0 && onSegment(c, d, a)) return true
  if (o4 === 0 && onSegment(c, d, b)) return true
  return false
}

/** Distância entre retângulos alinhados aos eixos; negativa quando há sobreposição. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(b.x0 - a.x1, a.x0 - b.x1)
  const dy = Math.max(b.y0 - a.y1, a.y0 - b.y1)
  if (dx > 0 && dy > 0) return Math.hypot(dx, dy)
  return Math.max(dx, dy)
}

/** Distância entre a borda do círculo e o retângulo; negativa quando há sobreposição. */
export function rectCircleGap(r: Rect, c: Circle): number {
  const dx = Math.max(r.x0 - c.x, 0, c.x - r.x1)
  const dy = Math.max(r.y0 - c.y, 0, c.y - r.y1)
  if (dx === 0 && dy === 0) {
    // centro dentro do retângulo
    return -c.r - Math.min(c.x - r.x0, r.x1 - c.x, c.y - r.y0, r.y1 - c.y)
  }
  return Math.hypot(dx, dy) - c.r
}

export function expandRect(r: Rect, d: number): Rect {
  return { x0: r.x0 - d, y0: r.y0 - d, x1: r.x1 + d, y1: r.y1 + d }
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0)
}

export function rectOverlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

/** Índice espacial simples para consultar círculos próximos a uma região. */
export class CircleIndex {
  private readonly cell: number
  private readonly buckets = new Map<string, number[]>()
  readonly circles: Circle[]

  constructor(circles: Circle[], cell = 50) {
    this.circles = circles
    this.cell = cell
    circles.forEach((c, i) => {
      for (const key of this.keys({ x0: c.x - c.r, y0: c.y - c.r, x1: c.x + c.r, y1: c.y + c.r })) {
        const list = this.buckets.get(key)
        if (list) list.push(i)
        else this.buckets.set(key, [i])
      }
    })
  }

  private *keys(r: Rect): Generator<string> {
    const i0 = Math.floor(r.x0 / this.cell)
    const i1 = Math.floor(r.x1 / this.cell)
    const j0 = Math.floor(r.y0 / this.cell)
    const j1 = Math.floor(r.y1 / this.cell)
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) yield `${i},${j}`
  }

  /** Círculos cuja caixa envolvente intersecta o retângulo. */
  query(r: Rect): Circle[] {
    const seen = new Set<number>()
    const out: Circle[] = []
    for (const key of this.keys(r)) {
      for (const i of this.buckets.get(key) ?? []) {
        if (seen.has(i)) continue
        seen.add(i)
        const c = this.circles[i]
        if (c.x + c.r >= r.x0 && c.x - c.r <= r.x1 && c.y + c.r >= r.y0 && c.y - c.r <= r.y1) out.push(c)
      }
    }
    return out
  }
}

/** Área líquida da chapa: contorno externo menos furos e recortes internos. */
export function netArea(g: PartGeometry): number {
  let a = Math.abs(exactSignedArea(g.outer))
  for (const h of g.holes) a -= Math.PI * h.r * h.r
  for (const c of g.cutouts) a -= Math.abs(exactSignedArea(c))
  return a
}

// ---------------------------------------------------------------------------
// Arcos (bulge)

export interface ArcInfo {
  cx: number
  cy: number
  r: number
  /** Ângulo inicial (rad). */
  a0: number
  /** Varredura com sinal (rad): positiva = anti-horária. */
  sweep: number
}

/** Arco definido por dois pontos e bulge = tan(varredura / 4). */
export function arcFromBulge(a: Point, b: Point, bulge: number): ArcInfo {
  const sweep = 4 * Math.atan(bulge)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy)
  const r = chord / (2 * Math.abs(Math.sin(sweep / 2)))
  // distância (com sinal) do ponto médio da corda ao centro, à esquerda do sentido a→b
  const h = (chord / 2) / Math.tan(sweep / 2)
  const cx = (a.x + b.x) / 2 - (dy / chord) * h
  const cy = (a.y + b.y) / 2 + (dx / chord) * h
  return { cx, cy, r, a0: Math.atan2(a.y - cy, a.x - cx), sweep }
}

export function bulgeOf(p: Point): number {
  return p.bulge && Math.abs(p.bulge) > 1e-12 ? p.bulge : 0
}

/**
 * Converte arcos em segmentos retos com erro de corda máximo `tol`, para
 * validações e testes de pertinência. A exportação usa sempre os arcos reais.
 */
export function flattenPolygon(poly: Polygon, tol = 0.01): Polygon {
  if (!poly.some((p) => bulgeOf(p) !== 0)) return poly
  const out: Polygon = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    out.push({ x: a.x, y: a.y })
    const bulge = bulgeOf(a)
    if (!bulge) continue
    const arc = arcFromBulge(a, b, bulge)
    const step = 2 * Math.acos(Math.max(-1, 1 - tol / arc.r))
    const n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / step))
    for (let k = 1; k < n; k++) {
      const t = arc.a0 + (arc.sweep * k) / n
      out.push({ x: arc.cx + arc.r * Math.cos(t), y: arc.cy + arc.r * Math.sin(t) })
    }
  }
  return out
}

/** Área com sinal exata, considerando os segmentos circulares dos arcos. */
export function exactSignedArea(poly: Polygon): number {
  let a = signedArea(poly)
  for (let i = 0; i < poly.length; i++) {
    const bulge = bulgeOf(poly[i])
    if (!bulge) continue
    const arc = arcFromBulge(poly[i], poly[(i + 1) % poly.length], bulge)
    a += ((arc.r * arc.r) / 2) * (arc.sweep - Math.sin(arc.sweep))
  }
  return a
}

/** Caixa envolvente exata, incluindo os extremos dos arcos. */
export function exactBounds(poly: Polygon): Rect {
  const b = polygonBounds(poly)
  for (let i = 0; i < poly.length; i++) {
    const bulge = bulgeOf(poly[i])
    if (!bulge) continue
    const arc = arcFromBulge(poly[i], poly[(i + 1) % poly.length], bulge)
    for (let q = -4; q <= 4; q++) {
      const ang = (q * Math.PI) / 2
      // o ângulo está dentro da varredura?
      const rel = arc.sweep > 0 ? ang - arc.a0 : arc.a0 - ang
      const norm = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      if (norm > 1e-12 && norm < Math.abs(arc.sweep) - 1e-12) {
        const x = arc.cx + arc.r * Math.cos(ang)
        const y = arc.cy + arc.r * Math.sin(ang)
        if (x < b.x0) b.x0 = x
        if (x > b.x1) b.x1 = x
        if (y < b.y0) b.y0 = y
        if (y > b.y1) b.y1 = y
      }
    }
  }
  return b
}

/** Menor distância entre dois segmentos (0 se se tocam). */
export function distSegmentSegment(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsTouch(a, b, c, d)) return 0
  return Math.min(distPointSegment(a, c, d), distPointSegment(b, c, d), distPointSegment(c, a, b), distPointSegment(d, a, b))
}

/** Menor distância entre os contornos de dois polígonos já linearizados. */
export function distPolygonPolygon(p: Polygon, q: Polygon): number {
  let d = Infinity
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      d = Math.min(d, distSegmentSegment(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length]))
      if (d === 0) return 0
    }
  }
  return d
}

/**
 * Contorno fechado com cantos arredondados. Cada vértice pode ter raio `r`:
 * o canto é substituído por um arco tangente às duas arestas (convexo ou
 * côncavo, conforme a curva do contorno). Vértices sem raio ficam vivos.
 */
export function filletedPolygon(pts: { x: number; y: number; r?: number; bulge?: number }[]): Polygon {
  const out: Polygon = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const v = pts[i]
    const r = v.r ?? 0
    if (r <= 0) {
      out.push(v.bulge ? { x: v.x, y: v.y, bulge: v.bulge } : { x: v.x, y: v.y })
      continue
    }
    const a = pts[(i - 1 + n) % n]
    const b = pts[(i + 1) % n]
    const l1 = Math.hypot(a.x - v.x, a.y - v.y)
    const l2 = Math.hypot(b.x - v.x, b.y - v.y)
    const d1 = { x: (a.x - v.x) / l1, y: (a.y - v.y) / l1 }
    const d2 = { x: (b.x - v.x) / l2, y: (b.y - v.y) / l2 }
    const phi = Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y))) // ângulo interno entre as arestas
    const t = r / Math.tan(phi / 2)
    const turn = Math.PI - phi
    const cross = (v.x - a.x) * (b.y - v.y) - (v.y - a.y) * (b.x - v.x)
    const bulge = Math.sign(cross) * Math.tan(turn / 4)
    out.push({ x: v.x + d1.x * t, y: v.y + d1.y * t, bulge }, { x: v.x + d2.x * t, y: v.y + d2.y * t })
  }
  return out
}

/** Rasgo oblongo entre os centros (x0, y0) e (x1, y1), com raio r (largura 2r). */
export function slotPolygon(x0: number, y0: number, x1: number, y1: number, r: number): Polygon {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  // normal à direita do sentido 0→1
  const nx = uy
  const ny = -ux
  return [
    { x: x0 + nx * r, y: y0 + ny * r },
    { x: x1 + nx * r, y: y1 + ny * r, bulge: 1 },
    { x: x1 - nx * r, y: y1 - ny * r },
    { x: x0 - nx * r, y: y0 - ny * r, bulge: 1 },
  ]
}
