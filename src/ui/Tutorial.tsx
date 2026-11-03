import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon } from './icons'
import { storage } from './storage'

export const TUTORIAL_KEY = 'mesafacil:tutorial'

export type TourPane = 'params' | 'view' | 'summary'
export type TourPage = 'mesa' | 'acessorios'

interface Step {
  title: string
  body: string
  target?: string
  pane?: TourPane
  page?: TourPage
}

const STEPS: Step[] = [
  {
    title: 'Bem-vindo ao MesaFácil!',
    body: 'Crie sua mesa de solda e seus acessórios sob medida, sem precisar utilizar programas de desenho técnico. Em 1 minuto mostramos o caminho. Nada do seu projeto será alterado.',
  },
  { title: 'Medidas do tampo', body: 'Digite o comprimento, a largura e a espessura da chapa em milímetros. O desenho muda na hora.', target: 'top', pane: 'params', page: 'mesa' },
  { title: 'Furos', body: 'Escolha o diâmetro e o passo (distância entre os centros dos furos). O MesaFácil calcula quantos furos cabem e centraliza a malha.', target: 'holes', pane: 'params', page: 'mesa' },
  { title: 'Laterais e reforços', body: 'Se quiser, ative chapas laterais e reforços por baixo do tampo. Eles podem ter abas que encaixam no tampo para facilitar a solda.', target: 'sides', pane: 'params', page: 'mesa' },
  { title: 'Veja as peças', body: 'Alterne entre a vista de cima e as peças separadas. Use a roda do mouse ou dois dedos para dar zoom e arraste para mover.', target: 'viewer-tabs', pane: 'view', page: 'mesa' },
  { title: 'Acessórios', body: 'Esquadros, cantoneiras e barras de fixação são gerados com o mesmo padrão de furos da sua mesa.', target: 'nav-accessories' },
  { title: 'Exportar os arquivos', body: 'Baixe um ZIP com os desenhos DXF de cada peça, a lista de peças e as especificações. DXF é o formato que as empresas de corte a laser usam.', target: 'export' },
  { title: 'Pedido de orçamento', body: 'Copie uma mensagem pronta com as medidas e quantidades para enviar por e-mail ou WhatsApp à empresa de corte.', target: 'quote', pane: 'view', page: 'mesa' },
]

interface Props {
  open: boolean
  onClose: (result: 'concluido' | 'pulado') => void
  onNavigate: (page?: TourPage, pane?: TourPane) => void
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Tutorial guiado que destaca os controles reais da interface. */
export function Tutorial({ open, onClose, onNavigate }: Props) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const s = STEPS[step]

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  useEffect(() => {
    if (open) onNavigate(s.page, s.pane)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step])

  // acompanha a posição do elemento destacado
  useLayoutEffect(() => {
    if (!open || !s.target) {
      setRect(null)
      return
    }
    let raf = 0
    let scrolled = false
    const update = () => {
      const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${s.target}"]`)]
      const el = all.find((e) => e.offsetParent !== null || e.getClientRects().length > 0)
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
          scrolled = true
        }
        const r = el.getBoundingClientRect()
        setRect((old) => (old && old.x === r.x && old.y === r.y && old.width === r.width && old.height === r.height ? old : r))
      } else setRect(null)
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [open, s.target])

  useEffect(() => {
    if (open) primaryRef.current?.focus()
  }, [open, step])

  if (!open) return null

  const last = step === STEPS.length - 1
  const finish = (result: 'concluido' | 'pulado') => {
    storage.set(TUTORIAL_KEY, result)
    onClose(result)
  }
  const next = () => (last ? finish('concluido') : setStep(step + 1))
  const back = () => setStep(Math.max(0, step - 1))

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      finish('pulado')
    } else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) next()
    else if (e.key === 'ArrowLeft') back()
    else if (e.key === 'Tab') {
      // mantém o foco dentro do cartão
      const f = [...(cardRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
      if (!f.length) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus()
    }
  }

  // posição do cartão: abaixo do alvo, acima se não couber; no celular, fixo embaixo
  const vw = window.innerWidth
  const vh = window.innerHeight
  const mobile = vw < 640
  const pad = 8
  let cardStyle: React.CSSProperties = {}
  if (rect && !mobile) {
    const width = 360
    const left = Math.min(Math.max(12, rect.left), vw - width - 12)
    const below = rect.bottom + pad + 12
    cardStyle = below + 230 < vh ? { top: below, left, width } : { top: Math.max(12, rect.top - pad - 12 - 230), left, width }
  }

  return (
    <div className="fixed inset-0 z-[100]" onKeyDown={onKeyDown}>
      {rect ? (
        <>
          {/* quatro faixas escuras ao redor do elemento destacado */}
          {[
            { left: 0, top: 0, width: '100%', height: Math.max(0, rect.top - pad) },
            { left: 0, top: rect.bottom + pad, width: '100%', bottom: 0 },
            { left: 0, top: rect.top - pad, width: Math.max(0, rect.left - pad), height: rect.height + 2 * pad },
            { left: rect.right + pad, top: rect.top - pad, right: 0, height: rect.height + 2 * pad },
          ].map((st, i) => (
            <div key={i} className="fixed bg-gray-900/55" style={st} />
          ))}
          <div className="pointer-events-none fixed rounded-xl ring-2 ring-accent" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }} />
        </>
      ) : (
        <div className="fixed inset-0 bg-gray-900/55" />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        data-testid="tutorial"
        className={`fixed rounded-2xl border border-line bg-surface p-5 shadow-2xl ${rect && !mobile ? '' : mobile ? 'inset-x-3 bottom-3' : 'left-1/2 top-1/2 w-[440px] -translate-x-1/2 -translate-y-1/2'}`}
        style={cardStyle}
      >
        <div className="mb-3 flex items-center gap-1.5" aria-label={`Etapa ${step + 1} de ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : i < step ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-line-strong'}`} />
          ))}
          <span className="ml-auto text-xs tabular-nums text-muted">
            {step + 1} de {STEPS.length}
          </span>
        </div>
        <h2 id="tour-title" className="text-base font-semibold text-ink">
          {s.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          {s.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className="btn-ghost -ml-2 text-muted" onClick={() => finish('pulado')} data-testid="tutorial-skip">
            {step === 0 ? 'Pular tutorial' : 'Pular'}
          </button>
          <span className="flex-1" />
          {step > 0 && (
            <button type="button" className="btn" onClick={back}>
              <Icon name="back" /> Voltar
            </button>
          )}
          <button ref={primaryRef} type="button" className="btn-primary" onClick={next} data-testid="tutorial-next">
            {step === 0 ? 'Começar tutorial' : last ? 'Concluir' : 'Próximo'}
            {!last && step > 0 && <Icon name="chevron" />}
          </button>
        </div>
      </div>
    </div>
  )
}
