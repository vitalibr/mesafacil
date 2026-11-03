import {
  CircleIndex,
  EPS,
  distPointPolygonEdge,
  distPolygonPolygon,
  flattenPolygon,
  pointInPolygon,
  segmentsTouch,
  signedArea,
} from './geom'
import type { PartGeometry, Polygon } from './types'

function polygonProblems(poly: Polygon, label: string): string[] {
  const out: string[] = []
  if (poly.length < 3) return [`${label} tem menos de 3 vértices`]
  if (poly.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return [`${label} tem coordenadas inválidas`]
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) out.push(`${label} tem segmento de comprimento zero`)
    const c = poly[(i + 2) % n]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
    if (Math.abs(cross) < EPS && dot < 0) out.push(`${label} tem segmentos sobrepostos`)
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // arestas adjacentes pelo fechamento
      if (segmentsTouch(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) {
        out.push(`${label} se autointersecta`)
        return out
      }
    }
  }
  if (Math.abs(signedArea(poly)) < EPS) out.push(`${label} tem área nula`)
  return out
}

function polygonsTouch(a: Polygon, b: Polygon): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsTouch(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
    }
  }
  return false
}

/**
 * Verifica se a geometria de uma peça é cortável: contorno fechado e simples,
 * furos e recortes inteiramente dentro da chapa, sem tocar o contorno nem uns
 * aos outros. Retorna a lista de problemas encontrados (vazia se válida).
 */
export function validatePartGeometry(input: PartGeometry, opts: { minWeb?: number } = {}): string[] {
  // arcos são conferidos linearizados (erro de corda de 0,01 mm)
  const g: PartGeometry = { outer: flattenPolygon(input.outer), holes: input.holes, cutouts: input.cutouts.map((c) => flattenPolygon(c)) }
  const out = polygonProblems(g.outer, 'O contorno externo')
  if (out.length) return out

  g.cutouts.forEach((c, i) => {
    const label = `O recorte ${i + 1}`
    const probs = polygonProblems(c, label)
    if (probs.length) {
      out.push(...probs)
      return
    }
    if (!c.every((p) => pointInPolygon(p, g.outer)) || polygonsTouch(c, g.outer)) {
      out.push(`${label} encosta ou ultrapassa o contorno externo`)
    }
    for (let j = i + 1; j < g.cutouts.length; j++) {
      const d = g.cutouts[j]
      if (polygonsTouch(c, d) || pointInPolygon(d[0], c) || pointInPolygon(c[0], d)) {
        out.push(`Os recortes ${i + 1} e ${j + 1} se sobrepõem`)
      }
    }
  })

  const index = new CircleIndex(g.holes)
  g.holes.forEach((h, i) => {
    if (!(h.r > EPS) || !Number.isFinite(h.x) || !Number.isFinite(h.y)) {
      out.push(`O furo ${i + 1} tem dimensões inválidas`)
      return
    }
    const p = { x: h.x, y: h.y }
    if (!pointInPolygon(p, g.outer) || distPointPolygonEdge(p, g.outer) <= h.r + EPS) {
      out.push(`O furo ${i + 1} encosta ou ultrapassa o contorno externo`)
    }
    for (const c of g.cutouts) {
      if (pointInPolygon(p, c) || distPointPolygonEdge(p, c) <= h.r + EPS) {
        out.push(`O furo ${i + 1} encosta em um recorte`)
        break
      }
    }
    for (const o of index.query({ x0: h.x - h.r, y0: h.y - h.r, x1: h.x + h.r, y1: h.y + h.r })) {
      if (o === h) continue
      if (Math.hypot(o.x - h.x, o.y - h.y) <= o.r + h.r + EPS) {
        out.push(`O furo ${i + 1} se sobrepõe a outro furo`)
        break
      }
    }
  })
  if (opts.minWeb && opts.minWeb > 0 && !out.length) out.push(...webProblems(g, opts.minWeb))
  // limita o tamanho da mensagem
  return out.length > 5 ? [...out.slice(0, 5), `e mais ${out.length - 5} problema(s)`] : out
}

/**
 * Material mínimo entre recursos (furos, recortes e contorno). Custo
 * quadrático: usado nas peças com poucos recursos, como os acessórios.
 */
function webProblems(g: PartGeometry, minWeb: number): string[] {
  const out: string[] = []
  const tol = 0.02 // erro de linearização dos arcos
  const fmt = (v: number) => v.toFixed(2).replace('.', ',')
  g.holes.forEach((h, i) => {
    const e = distPointPolygonEdge(h, g.outer) - h.r
    if (e < minWeb - tol) out.push(`o furo ${i + 1} fica a ${fmt(e)} mm da borda`)
    g.cutouts.forEach((c, j) => {
      const d = distPointPolygonEdge(h, c) - h.r
      if (d < minWeb - tol) out.push(`o furo ${i + 1} fica a ${fmt(d)} mm do recorte ${j + 1}`)
    })
    for (let k = i + 1; k < g.holes.length; k++) {
      const o = g.holes[k]
      const d = Math.hypot(o.x - h.x, o.y - h.y) - o.r - h.r
      if (d < minWeb - tol) out.push(`os furos ${i + 1} e ${k + 1} ficam a ${fmt(d)} mm um do outro`)
    }
  })
  g.cutouts.forEach((c, j) => {
    const e = distPolygonPolygon(c, g.outer)
    if (e < minWeb - tol) out.push(`o recorte ${j + 1} fica a ${fmt(e)} mm da borda`)
    for (let k = j + 1; k < g.cutouts.length; k++) {
      const d = distPolygonPolygon(c, g.cutouts[k])
      if (d < minWeb - tol) out.push(`os recortes ${j + 1} e ${k + 1} ficam a ${fmt(d)} mm um do outro`)
    }
  })
  return out
}
