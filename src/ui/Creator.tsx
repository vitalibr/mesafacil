import { useEffect, useRef, type KeyboardEvent } from 'react'
import { track } from './analytics'
import { CREATOR } from './creatorInfo'

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8zM9.7 15.1V8.9l5.6 3.1z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

export function CreatorBadge({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hidden items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-ink-soft hover:bg-page sm:inline-flex" title="Conheça o canal VM Garage" data-testid="creator-badge">
      <img src={CREATOR.logo} alt="" className="h-6 w-6 rounded" />
      <span className="hidden xl:inline">
        Criado por <span className="font-semibold text-ink">VM Garage</span>
      </span>
    </button>
  )
}

export function CreatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const first = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (open) first.current?.focus()
  }, [open])
  if (!open) return null
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab') {
      const items = [...(e.currentTarget.querySelectorAll<HTMLElement>('a,button') ?? [])]
      const i = items.indexOf(document.activeElement as HTMLElement)
      e.preventDefault()
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus()
    }
  }
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-gray-900/60 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-title"
        data-testid="creator-modal"
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-[#d9a02c]/40 bg-[#111111] text-white shadow-2xl"
      >
        <div className="flex flex-col items-center px-6 pb-2 pt-6 text-center">
          <img src={CREATOR.logo} alt="Logo VM Garage" className="h-28 w-28" />
          <h2 id="creator-title" className="mt-3 text-lg font-semibold">
            Feito pela <span className="text-[#f3c94c]">VM Garage</span>
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/75">
            O MesaFácil é gratuito. Oficina, usinagem, solda e projetos de garagem no canal. Se a ferramenta te ajudou, acompanhe por lá!
          </p>
        </div>
        <div className="grid gap-2 px-6 pb-4 pt-3">
          <a ref={first} href={CREATOR.youtube} target="_blank" rel="noopener noreferrer" onClick={() => {
              track('vmgarage-youtube')
              onClose()
            }} className="flex items-center justify-center gap-2 rounded-lg bg-[#ff0033] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <YouTubeIcon /> Inscreva-se no YouTube
          </a>
          <a href={CREATOR.instagram} target="_blank" rel="noopener noreferrer" onClick={() => {
              track('vmgarage-instagram')
              onClose()
            }} className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <InstagramIcon /> Siga no Instagram
          </a>
          <button type="button" onClick={onClose} className="mt-1 rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white focus-visible:outline-2 focus-visible:outline-white" data-testid="creator-close">
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
