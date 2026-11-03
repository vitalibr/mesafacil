import type { ResolvedAccessory } from '../engine/accessories'
import type { BomItem, GeneratedProject } from '../engine/types'
import { DISCLAIMER, estimatedMassKg } from '../export/documents'
import type { makeActions } from './actions'
import { Icon } from './icons'

const n = (v: number, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d })

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-ink">{value}</div>
      {note && <div className="text-[11px] text-muted">{note}</div>}
    </div>
  )
}

export function Summary({ project, accessories, actions }: { project: GeneratedProject; accessories: ResolvedAccessory[]; actions: ReturnType<typeof makeActions> }) {
  const s = project.stats
  const c = project.config
  const items: BomItem[] = [...project.bom, ...accessories.flatMap((a) => a.bom)]
  const mass = items.reduce((t, b) => t + estimatedMassKg(b) * b.quantity, 0)
  return (
    <section className="space-y-4" data-tour="summary" aria-labelledby="summary-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="summary-title" className="text-base font-semibold text-ink">
            Resumo do projeto
          </h2>
          <p className="text-xs text-muted">Atualizado automaticamente a cada alteração.</p>
        </div>
        <div className="flex flex-wrap gap-2" data-tour="export-actions">
          <button type="button" className="btn" onClick={actions.quote} disabled={actions.blocked} data-testid="copy-quote">
            <Icon name="copy" /> Copiar pedido de orçamento
          </button>
          <button type="button" className="btn" onClick={actions.csv} disabled={actions.blocked}>
            <Icon name="table" /> Lista CSV
          </button>
          <button type="button" className="btn-primary" onClick={actions.zip} disabled={actions.blocked} data-testid="download-zip">
            <Icon name="download" /> Baixar projeto completo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Tampo" value={Number.isFinite(c.top.length) && Number.isFinite(c.top.width) ? `${n(c.top.length)} × ${n(c.top.width)}` : '—'} note="mm" />
        <Stat label="Furos no tampo" value={s.topHoleCount.toLocaleString('pt-BR')} />
        <Stat label="Laterais" value={String(s.sideCount)} />
        <Stat label="Reforços" value={String(s.ribCount)} />
        <Stat label="Componentes" value={String(items.reduce((t, b) => t + b.quantity, 0))} note={`${items.length} peças diferentes`} />
        <Stat label="Massa" value={`≈ ${n(mass)} kg`} note="estimativa em aço" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm" data-testid="bom-table">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 text-right font-medium">Qtd.</th>
              <th className="px-3 py-2 text-right font-medium">Comprimento</th>
              <th className="px-3 py-2 text-right font-medium">Largura/altura</th>
              <th className="px-3 py-2 text-right font-medium">Espessura</th>
              <th className="px-3 py-2 font-medium">Arquivo DXF</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.code} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-muted">{b.code}</td>
                <td className="px-3 py-2 text-ink">{b.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(b.length, 2)} mm</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(b.height, 2)} mm</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(b.thickness, 2)} mm</td>
                <td className="px-3 py-2">
                  <button type="button" className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline disabled:text-muted disabled:no-underline" onClick={() => actions.dxf(b)} disabled={actions.blocked} title="Baixar este DXF">
                    <Icon name="download" className="h-3.5 w-3.5" /> {b.fileName}
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  Corrija os erros para gerar as peças.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Área e massa são estimativas (aço a 7,85 g/cm³); dimensões e quantidades são exatas. A ferramenta valida apenas a geometria, não a resistência da mesa. {DISCLAIMER}
      </p>
    </section>
  )
}
