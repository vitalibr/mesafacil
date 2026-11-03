import { useState } from 'react'
import type { ValidationIssue } from '../engine/types'
import { Icon } from './icons'

function statusOf(issues: ValidationIssue[]) {
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  return { errors, warnings, state: errors.length ? ('invalid' as const) : warnings.length ? ('warning' as const) : ('valid' as const) }
}

/** Selo de estado do projeto com a lista de erros e avisos. */
export function StatusBar({ issues, subject = 'Projeto' }: { issues: ValidationIssue[]; subject?: string }) {
  const { errors, warnings, state } = statusOf(issues)
  const [open, setOpen] = useState(false)
  const showList = open || errors.length > 0
  const tone = {
    valid: 'border-ok/25 bg-ok-soft text-ok',
    warning: 'border-warn/25 bg-warn-soft text-warn',
    invalid: 'border-bad/25 bg-bad-soft text-bad',
  }[state]
  const text = {
    valid: `${subject} válido`,
    warning: `${subject} com ${warnings.length} aviso${warnings.length > 1 ? 's' : ''}`,
    invalid: `${subject} inválido: ${errors.length} erro${errors.length > 1 ? 's' : ''}${warnings.length ? ` e ${warnings.length} aviso${warnings.length > 1 ? 's' : ''}` : ''}`,
  }[state]
  return (
    <div className={`rounded-lg border text-sm ${tone}`} data-testid="status" data-state={state} role="status" aria-live="polite">
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium" onClick={() => setOpen((o) => !o)} aria-expanded={showList} disabled={!issues.length}>
        <Icon name={state === 'valid' ? 'check' : state === 'warning' ? 'alert' : 'error'} />
        <span className="flex-1">{text}</span>
        {issues.length > 0 && errors.length === 0 && <Icon name="down" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {showList && issues.length > 0 && (
        <ul className="max-h-48 space-y-1.5 overflow-auto border-t border-current/15 px-3 py-2 text-xs leading-relaxed">
          {[...errors, ...warnings].map((i, n) => (
            <li key={n} className="flex gap-2">
              <span className="mt-0.5 shrink-0">{i.severity === 'error' ? <Icon name="error" className="h-3.5 w-3.5" /> : <Icon name="alert" className="h-3.5 w-3.5" />}</span>
              <span className="text-ink-soft">{i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
