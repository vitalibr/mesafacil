import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Rect } from '../engine/types'
import { Icon } from './icons'

interface View {
  k: number
  tx: number
  ty: number
}

interface Props {
  /** Região do desenho (coordenadas técnicas, y para cima) a enquadrar. */
  bounds: Rect
  /** Muda quando o enquadramento automático deve ser refeito. */
  fitKey: string
  showGrid: boolean
  gridStep?: number
  children: (scale: number) => ReactNode
  overlay?: ReactNode
  label: string
}

const MIN_K = 0.005
const MAX_K = 200

/** Área de desenho com zoom (roda, pinça, botões), arraste e ajuste à tela. */
export function CanvasView({ bounds, fitKey, showGrid, gridStep = 100, children, overlay, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; view: View; cx: number; cy: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    if (!size.w || !size.h) return
    const bw = Math.max(bounds.x1 - bounds.x0, 1)
    const bh = Math.max(bounds.y1 - bounds.y0, 1)
    const pad = Math.min(48, size.w * 0.08)
    const k = Math.min((size.w - 2 * pad) / bw, (size.h - 2 * pad) / bh)
    // tela: sx = tx + x·k ; sy = ty − y·k
    setView({ k, tx: (size.w - bw * k) / 2 - bounds.x0 * k, ty: (size.h + bh * k) / 2 + bounds.y0 * k })
  }, [bounds.x0, bounds.x1, bounds.y0, bounds.y1, size.w, size.h])

  // reenquadra quando o desenho muda de tamanho ou de assunto
  const lastFit = useRef('')
  useEffect(() => {
    const key = `${fitKey}|${size.w}x${size.h}`
    if (key !== lastFit.current && size.w) {
      lastFit.current = key
      fit()
    }
  }, [fitKey, size.w, size.h, fit])

  const zoomAt = useCallback((factor: number, sx: number, sy: number) => {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor))
      const f = k / v.k
      return { k, tx: sx - (sx - v.tx) * f, ty: sy - (sy - v.ty) * f }
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-canvas-ui]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const r = ref.current!.getBoundingClientRect()
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top }
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const p = pinch.current
      const k = Math.min(MAX_K, Math.max(MIN_K, (p.view.k * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist))
      const f = k / p.view.k
      setView({ k, tx: p.cx - (p.cx - p.view.tx) * f, ty: p.cy - (p.cy - p.view.ty) * f })
    } else if (pointers.current.size === 1) {
      setView((v) => ({ ...v, tx: v.tx + e.clientX - prev.x, ty: v.ty + e.clientY - prev.y }))
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 40
    if (e.key === '+' || e.key === '=') zoomAt(1.25, size.w / 2, size.h / 2)
    else if (e.key === '-') zoomAt(0.8, size.w / 2, size.h / 2)
    else if (e.key === '0') fit()
    else if (e.key === 'ArrowLeft') setView((v) => ({ ...v, tx: v.tx + step }))
    else if (e.key === 'ArrowRight') setView((v) => ({ ...v, tx: v.tx - step }))
    else if (e.key === 'ArrowUp') setView((v) => ({ ...v, ty: v.ty + step }))
    else if (e.key === 'ArrowDown') setView((v) => ({ ...v, ty: v.ty - step }))
    else return
    e.preventDefault()
  }

  // grade visual (somente referência na tela)
  let grid: ReactNode = null
  if (showGrid && size.w) {
    let step = gridStep
    while (step * view.k < 12) step *= 2
    const x0 = Math.floor(-view.tx / view.k / step) * step
    const x1 = (size.w - view.tx) / view.k
    const y0 = Math.floor(((view.ty - size.h) / view.k) / step) * step
    const y1 = view.ty / view.k
    let d = ''
    for (let x = x0; x <= x1; x += step) d += `M${x} ${-y0}V${-y1}`
    for (let y = y0; y <= y1; y += step) d += `M${x0} ${-y}H${x1}`
    grid = <path d={d} className="stroke-grid" fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
  }

  return (
    <div
      ref={ref}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-canvas outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label={`${label}. Use + e − para zoom, setas para mover e 0 para ajustar à tela.`}
    >
      <svg width={size.w} height={size.h} className="block">
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {grid}
          {children(view.k)}
        </g>
      </svg>
      {overlay}
      <div data-canvas-ui className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-line bg-surface/95 shadow-sm backdrop-blur">
        <button type="button" className="canvas-btn" onClick={() => zoomAt(1.4, size.w / 2, size.h / 2)} aria-label="Aproximar" title="Aproximar">
          <Icon name="plus" />
        </button>
        <button type="button" className="canvas-btn border-y border-line" onClick={() => zoomAt(1 / 1.4, size.w / 2, size.h / 2)} aria-label="Afastar" title="Afastar">
          <Icon name="minus" />
        </button>
        <button type="button" className="canvas-btn" onClick={fit} aria-label="Ajustar à tela" title="Ajustar à tela">
          <Icon name="fit" />
        </button>
      </div>
    </div>
  )
}
