import { DxfWriter, LWPolylineFlags, Units, point3d } from '@tarikjabiri/dxf'
import type { PartGeometry, Polygon } from '../engine/types'

export const CUT_LAYER = 'CORTE'

/**
 * DXF de fabricação de uma peça: escala 1:1, milímetros, somente a camada
 * CORTE. Contornos como LWPOLYLINE fechadas e furos como CIRCLE verdadeiros.
 * Nenhuma cota, texto ou linha auxiliar.
 */
export function partToDxf(g: PartGeometry): string {
  const dxf = new DxfWriter()
  dxf.setUnits(Units.Millimeters)
  dxf.addLayer(CUT_LAYER, 7, 'CONTINUOUS')
  dxf.setCurrentLayerName(CUT_LAYER)
  const poly = (p: Polygon) =>
    dxf.addLWPolyline(
      p.map((pt) => (pt.bulge ? { point: { x: pt.x, y: pt.y }, bulge: pt.bulge } : { point: { x: pt.x, y: pt.y } })),
      { flags: LWPolylineFlags.Closed },
    )
  poly(g.outer)
  for (const c of g.cutouts) poly(c)
  for (const h of g.holes) dxf.addCircle(point3d(h.x, h.y), h.r)
  return dxf.stringify()
}
