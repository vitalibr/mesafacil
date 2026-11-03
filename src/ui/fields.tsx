import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'

/** Ajuda curta junto ao campo: abre ao passar o mouse, ao focar ou ao tocar. */
export function Help({ children, label = 'Ajuda' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e instanceof PointerEvent && ref.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="rounded-full text-muted/70 hover:text-accent focus-visible:text-accent focus-visible:outline-none"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Icon name="info" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-5 z-50 w-60 -translate-x-1/2 rounded-lg border border-line bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg sm:left-0 sm:translate-x-0"
        >
          {children}
        </span>
      )}
    </span>
  )
}

interface FieldShell {
  label: string
  help?: ReactNode
  hint?: ReactNode
  invalid?: boolean
}

function Label({ htmlFor, label, help }: { htmlFor: string; label: string; help?: ReactNode }) {
  return (
    <span className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-soft">
      <label htmlFor={htmlFor}>{label}</label>
      {help && <Help label={`Ajuda: ${label}`}>{help}</Help>}
    </span>
  )
}

/** Converte texto digitado (aceita vírgula decimal) em número; vazio/inválido vira NaN. */
function parseDecimal(text: string): number {
  const t = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!t || !/^[-+]?\d*\.?\d*$/.test(t)) return Number.NaN
  return Number(t)
}

const show = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(4))).replace('.', ',') : '')

export function NumberField({
  label,
  value,
  onChange,
  unit = 'mm',
  help,
  hint,
  integer,
  min,
  step,
  invalid,
  testId,
}: FieldShell & {
  value: number
  onChange: (v: number) => void
  unit?: string
  integer?: boolean
  min?: number
  step?: number
  testId?: string
}) {
  const id = useId()
  const [text, setText] = useState(show(value))
  const focused = useRef(false)
  // sincroniza quando o valor muda por fora (carregar projeto, novo projeto)
  useEffect(() => {
    if (!focused.current && parseDecimal(text) !== value) setText(show(value))
  }, [value, text])
  const parsed = parseDecimal(text)
  const bad = invalid || !Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || (min !== undefined && parsed < min)
  return (
    <div>
      <Label htmlFor={id} label={label} help={help} />
      <div className="relative">
        <input
          id={id}
          data-testid={testId}
          className="field-input pr-11"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={text}
          aria-invalid={bad || undefined}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false
            if (Number.isFinite(parsed)) setText(show(parsed))
          }}
          onChange={(e) => {
            setText(e.target.value)
            onChange(parseDecimal(e.target.value))
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
            e.preventDefault()
            const base = Number.isFinite(parsed) ? parsed : 0
            const s = (step ?? (integer ? 1 : 1)) * (e.shiftKey ? 10 : 1)
            const next = Number((base + (e.key === 'ArrowUp' ? s : -s)).toFixed(4))
            setText(show(next))
            onChange(next)
          }}
        />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted">{unit}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function TextField({ label, value, onChange, help, placeholder, multiline, list }: FieldShell & { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; list?: string[] }) {
  const id = useId()
  const listId = useId()
  return (
    <div>
      <Label htmlFor={id} label={label} help={help} />
      {multiline ? (
        <textarea id={id} className="field-input min-h-16 resize-y" value={value} placeholder={placeholder} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <>
          <input id={id} className="field-input" value={value} placeholder={placeholder} maxLength={200} list={list ? listId : undefined} onChange={(e) => onChange(e.target.value)} />
          {list && (
            <datalist id={listId}>
              {list.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
        </>
      )}
    </div>
  )
}

export function Toggle({ label, checked, onChange, help, testId, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode; testId?: string; description?: string }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-medium text-ink">
          <label htmlFor={id} className="cursor-pointer">
            {label}
          </label>
          {help && <Help label={`Ajuda: ${label}`}>{help}</Help>}
        </span>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${checked ? 'bg-accent' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange, help }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; help?: ReactNode }) {
  const id = useId()
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-soft">
        <span id={id}>{label}</span>
        {help && <Help label={`Ajuda: ${label}`}>{help}</Help>}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-page p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-sm focus-visible:outline-2 focus-visible:outline-accent"
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Section({ title, icon, children, defaultOpen = true, aside, tour }: { title: string; icon?: string; children: ReactNode; defaultOpen?: boolean; aside?: ReactNode; tour?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="card" data-tour={tour}>
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {icon && <Icon name={icon} className="h-4 w-4 text-muted" />}
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          <Icon name="down" className={`ml-auto h-4 w-4 text-muted transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {aside}
      </div>
      {open && (
        <div id={id} className="space-y-3 border-t border-line px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </section>
  )
}

export function Grid2({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}
