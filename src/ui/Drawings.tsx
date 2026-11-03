import { memo, useMemo } from 'react'
import { exactBounds } from '../engine/geom'
import { partFootprint } from '../engine/plate'
import type { GeneratedPart, GeneratedProject, PartGeometry, Rect } from '../engine/types'
import { CanvasView } from './CanvasView'
import { geometryPaths } from './svg'

const fmt = (v: number) => Number(v.toFixed(1)).toLocaleString('pt-BR')

/** Cota horizontal ou vertical com texto de tamanho constante na tela. */
function Dimension({ x0, y0, x1, y1, offset, k, text }: { x0: number; y0: number; x1: number; y1: number; offset: number; k: number; text: string }) {
  const horizontal = Math.abs(y1 - y0) < Math.abs(x1 - x0)
  const fs = 11 / k
  const tick = 4 / k
  if (horizontal) {
    const y = -(y0 + offset)
    return (
      <g className="text-muted" pointerEvents="none">
        <path d={`M${x0} ${-y0}V${y}M${x1} ${-y0}V${y}M${x0} ${y}H${x1}M${x0} ${y - tick}l${tick} ${2 * tick}M${x1} ${y - tick}l${-tick} ${2 * tick}`} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" opacity={0.7} />
        <text x={(x0 + x1) / 2} y={y - 4 / k} fontSize={fs} textAnchor="middle" fill="currentColor" className="font-medium tabular-nums">
          {text}
        </text>
      </g>
    )
  }
  const x = x0 + offset
  return (
    <g className="text-muted" pointerEvents="none">
      <path d={`M${x0} ${-y0}H${x}M${x1} ${-y1}H${x}M${x} ${-y0}V${-y1}M${x - tick} ${-y0 + tick}l${2 * tick} ${-2 * tick}M${x - tick} ${-y1 + tick}l${2 * tick} ${-2 * tick}`} stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" opacity={0.7} />
      <text x={x} y={-(y0 + y1) / 2} fontSize={fs} textAnchor="middle" fill="currentColor" transform={`rotate(-90 ${x} ${-(y0 + y1) / 2}) translate(0 ${-5 / k})`} className="font-medium tabular-nums">
        {text}
      </text>
    </g>
  )
}

/** Chapa desenhada a partir da geometria que também vai para o DXF. */
const Plate = memo(function Plate({ g, dx = 0, dy = 0, selected }: { g: PartGeometry; dx?: number; dy?: number; selected?: boolean }) {
  const p = useMemo(() => geometryPaths(g, dx, dy), [g, dx, dy])
  return (
    <g>
      <path d={p.outer + p.cutouts + p.holes} fillRule="evenodd" className={selected ? 'fill-accent-soft' : 'fill-plate'} />
      <path d={p.outer} fill="none" className={selected ? 'stroke-accent' : 'stroke-cut'} strokeWidth={selected ? 2 : 1.4} vectorEffect="non-scaling-stroke" />
      {p.cutouts && <path d={p.cutouts} fill="none" className="stroke-hole" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
      {p.holes && <path d={p.holes} fill="none" className="stroke-hole" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
    </g>
  )
})

export function TopView({ project, showGrid, showDims }: { project: GeneratedProject; showGrid: boolean; showDims: boolean }) {
  const top = project.parts.find((p) => p.kind === 'top')
  const parts = project.parts
  const footprints = useMemo(
    () => parts.map((p) => ({ part: p, rect: partFootprint(p) })).filter((f): f is { part: GeneratedPart; rect: Rect } => f.rect !== null),
    [parts],
  )
  const markers = useMemo(() => project.issues.flatMap((i) => (i.severity === 'error' || i.code === 'holes-obstructed' ? (i.markers ?? []).map((m) => ({ m, error: i.severity === 'error' })) : [])), [project.issues])
  const L = project.config.top.length
  const W = project.config.top.width
  const valid = top && Number.isFinite(L) && Number.isFinite(W)
  const bounds = valid ? { x0: -0.12 * Math.max(L, W), y0: -0.12 * Math.max(L, W), x1: L, y1: W } : { x0: 0, y0: 0, x1: 100, y1: 100 }
  const hasSides = footprints.some((f) => f.part.kind.startsWith('side'))
  const hasRibs = footprints.some((f) => f.part.kind.startsWith('rib'))

  return (
    <CanvasView
      bounds={bounds}
      fitKey={`top|${Math.round(L)}|${Math.round(W)}`}
      showGrid={showGrid}
      label="Vista superior do tampo"
      overlay={
        (hasSides || hasRibs) && (
          <div className="pointer-events-none absolute bottom-3 left-3 space-y-1 rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs text-ink-soft shadow-sm" data-testid="legend">
            <div className="flex items-center gap-2">
              <span className="h-0 w-5 border-t-2 border-cut" /> Contorno e rasgos (corte)
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-hole" /> Furos
            </div>
            {hasSides && (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-5 bg-under/30" /> Laterais (por baixo)
              </div>
            )}
            {hasRibs && (
              <div className="flex items-center gap-2">
                <span className="h-0 w-5 border-t-2 border-dashed border-under" /> Reforços (por baixo)
              </div>
            )}
          </div>
        )
      }
    >
      {(k) =>
        valid && (
          <>
            <Plate g={top.geometry} />
            {footprints.map(({ part, rect }) => (
              <rect
                key={part.id}
                x={rect.x0}
                y={-rect.y1}
                width={rect.x1 - rect.x0}
                height={rect.y1 - rect.y0}
                className={part.kind.startsWith('side') ? 'fill-under/30 stroke-under' : 'fill-under/10 stroke-under'}
                strokeDasharray={part.kind.startsWith('rib') ? '6 4' : undefined}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              >
                <title>{part.name}</title>
              </rect>
            ))}
            {markers.map(({ m, error }, i) => (
              <rect key={i} x={m.x0} y={-m.y1} width={m.x1 - m.x0} height={m.y1 - m.y0} fill="none" className={error ? 'stroke-bad' : 'stroke-warn'} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ))}
            {showDims && (
              <>
                <Dimension x0={0} y0={0} x1={L} y1={0} offset={-28 / k} k={k} text={`${fmt(L)} mm`} />
                <Dimension x0={0} y0={0} x1={0} y1={W} offset={-28 / k} k={k} text={`${fmt(W)} mm`} />
              </>
            )}
          </>
        )
      }
    </CanvasView>
  )
}

export interface DrawingItem {
  key: string
  title: string
  subtitle: string
  geometry: PartGeometry
}

/** Peças individuais lado a lado (apenas para inspeção, sem aproveitamento de chapa). */
export function PartsView({ items, selected, onSelect, showGrid, showDims, fitKey }: { items: DrawingItem[]; selected: string | null; onSelect: (k: string) => void; showGrid: boolean; showDims: boolean; fitKey: string }) {
  const layout = useMemo(() => {
    const boxes = items.map((it) => {
      const b = exactBounds(it.geometry.outer)
      return { it, w: b.x1 - b.x0, h: b.y1 - b.y0, b }
    })
    const maxW = Math.max(1, ...boxes.map((b) => b.w))
    const total = boxes.reduce((s, b) => s + b.w * b.h, 0)
    const rowWidth = Math.max(maxW, Math.sqrt(total) * 2)
    const gap = Math.max(40, maxW * 0.08)
    const rowGap = Math.max(60, maxW * 0.3) // espaço para cotas e títulos entre linhas
    const placed: { it: DrawingItem; x: number; y: number; w: number; h: number; b: Rect }[] = []
    let x = 0
    let y = 0
    let rowH = 0
    for (const bx of boxes) {
      if (x > 0 && x + bx.w > rowWidth) {
        x = 0
        y -= rowH + rowGap
        rowH = 0
      }
      placed.push({ ...bx, x, y: y - bx.h })
      x += bx.w + gap
      rowH = Math.max(rowH, bx.h)
    }
    const x1 = Math.max(...placed.map((p) => p.x + p.w), 1)
    const y0 = Math.min(...placed.map((p) => p.y), 0)
    return { placed, bounds: { x0: -gap * 0.5, y0: y0 - gap * 0.5, x1: x1 + gap * 0.3, y1: gap * 0.9 } }
  }, [items])

  return (
    <CanvasView bounds={layout.bounds} fitKey={fitKey} showGrid={showGrid} label="Peças para corte">
      {(k) =>
        layout.placed.map(({ it, x, y, w, h, b }) => {
          const isSel = selected === it.key
          return (
            <g key={it.key} onClick={() => onSelect(it.key)} className="cursor-pointer" role="button" aria-label={`Selecionar ${it.title}`}>
              <rect x={x - 6 / k} y={-(y + h) - 6 / k} width={w + 12 / k} height={h + 12 / k} fill="transparent" className={isSel ? 'stroke-accent/40' : ''} strokeWidth={isSel ? 1 : 0} vectorEffect="non-scaling-stroke" rx={4 / k} />
              <Plate g={it.geometry} dx={x - b.x0} dy={y - b.y0} selected={isSel} />
              <text x={x} y={-(y + h) - 30 / k} fontSize={12 / k} className={isSel ? 'fill-accent font-semibold' : 'fill-ink font-semibold'}>
                {it.title}
              </text>
              <text x={x} y={-(y + h) - 14 / k} fontSize={10.5 / k} className="fill-muted">
                {it.subtitle}
              </text>
              {showDims && (
                <>
                  <Dimension x0={x} y0={y} x1={x + w} y1={y} offset={-18 / k} k={k} text={fmt(w)} />
                  <Dimension x0={x + w} y0={y} x1={x + w} y1={y + h} offset={18 / k} k={k} text={fmt(h)} />
                </>
              )}
            </g>
          )
        })
      }
    </CanvasView>
  )
}
