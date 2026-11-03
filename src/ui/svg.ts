import { arcFromBulge, bulgeOf } from '../engine/geom'
import type { Circle, PartGeometry, Polygon } from '../engine/types'

// O SVG tem o eixo Y para baixo; o desenho técnico, para cima. Toda a geometria
// é desenhada com y negado, e as transformações de câmera ficam no CanvasView.

const f = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** Caminho SVG de um contorno com retas e arcos (bulge). */
export function polygonPath(poly: Polygon, dx = 0, dy = 0): string {
  if (!poly.length) return ''
  let d = `M${f(poly[0].x + dx)} ${f(-(poly[0].y + dy))}`
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const bulge = bulgeOf(a)
    if (bulge) {
      const arc = arcFromBulge(a, b, bulge)
      const large = Math.abs(arc.sweep) > Math.PI ? 1 : 0
      // y negado inverte o sentido: arco anti-horário vira sweep-flag 0
      const sweep = arc.sweep > 0 ? 0 : 1
      d += `A${f(arc.r)} ${f(arc.r)} 0 ${large} ${sweep} ${f(b.x + dx)} ${f(-(b.y + dy))}`
    } else if (i < poly.length - 1) {
      d += `L${f(b.x + dx)} ${f(-(b.y + dy))}`
    }
  }
  return d + 'Z'
}

/** Todos os furos num único caminho (um nó só, mesmo com milhares de furos). */
export function circlesPath(circles: Circle[], dx = 0, dy = 0): string {
  let d = ''
  for (const c of circles) {
    const x = c.x + dx
    const y = -(c.y + dy)
    d += `M${f(x - c.r)} ${f(y)}a${f(c.r)} ${f(c.r)} 0 1 0 ${f(2 * c.r)} 0a${f(c.r)} ${f(c.r)} 0 1 0 ${f(-2 * c.r)} 0`
  }
  return d
}

export function geometryPaths(g: PartGeometry, dx = 0, dy = 0) {
  return {
    outer: polygonPath(g.outer, dx, dy),
    cutouts: g.cutouts.map((c) => polygonPath(c, dx, dy)).join(''),
    holes: circlesPath(g.holes, dx, dy),
  }
}
