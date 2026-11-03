import { Suspense, lazy, useMemo, useState } from 'react'
import { ACCESSORIES, accessoryById, createAccessoryInstance, resolveAccessory, tablePattern, type AccessoryInstance, type ParamSpec, type ResolvedAccessory } from '../engine/accessories'
import { exactBounds } from '../engine/geom'
import type { ProjectConfig } from '../engine/types'
import { downloadAccessoryZip, downloadItemDxf, type Notify } from './actions'
import { PartsView } from './Drawings'
import { Grid2, NumberField, Segmented, Toggle } from './fields'
import { HELP } from './helpTexts'
import { Icon } from './icons'
import { StatusBar } from './Status'
import { accessorySolids } from './solids'
import { geometryPaths } from './svg'

const Viewer3D = lazy(() => import('./Viewer3D'))

const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** Miniatura gerada pelo próprio motor geométrico (não é uma imagem estática). */
function Thumbnail({ resolved }: { resolved: ResolvedAccessory | null }) {
  const content = useMemo(() => {
    if (!resolved || !resolved.bom.length) return null
    let x = 0
    const gap = 20
    const items = resolved.bom.map((b) => {
      const bb = exactBounds(b.geometry.outer)
      const it = { b, x, w: bb.x1 - bb.x0, h: bb.y1 - bb.y0 }
      x += it.w + gap
      return it
    })
    const H = Math.max(...items.map((i) => i.h))
    return { items, W: x - gap, H }
  }, [resolved])
  if (!content) return <div className="flex h-full items-center justify-center text-xs text-muted">Sem prévia</div>
  return (
    <svg viewBox={`-10 ${-content.H - 10} ${content.W + 20} ${content.H + 20}`} className="h-full w-full" aria-hidden="true">
      {content.items.map(({ b, x }) => {
        const p = geometryPaths(b.geometry, x, 0)
        return (
          <g key={b.code}>
            <path d={p.outer + p.cutouts + p.holes} fillRule="evenodd" className="fill-plate" />
            <path d={p.outer + p.cutouts + p.holes} fill="none" className="stroke-cut" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          </g>
        )
      })}
    </svg>
  )
}

function ParamField({ spec, value, onChange }: { spec: ParamSpec; value: unknown; onChange: (v: number | string | boolean) => void }) {
  if (spec.kind === 'select') {
    return <Segmented label={spec.label} value={String(value)} options={spec.options!} onChange={onChange} help={spec.help} />
  }
  if (spec.kind === 'boolean') return <Toggle label={spec.label} checked={Boolean(value)} onChange={onChange} help={spec.help} />
  return (
    <NumberField
      label={spec.label}
      value={Number(value)}
      unit={spec.kind === 'mm' ? 'mm' : ''}
      integer={spec.kind === 'count'}
      min={spec.min}
      step={spec.kind === 'mm' && (spec.max ?? 10) <= 3 ? 0.1 : 1}
      onChange={onChange}
      help={spec.help}
    />
  )
}

function Configurator({
  instance,
  config,
  onChange,
  inProject,
  onAdd,
  onBack,
  notify,
}: {
  instance: AccessoryInstance
  config: ProjectConfig
  onChange: (i: AccessoryInstance) => void
  inProject: boolean
  onAdd: () => void
  onBack: () => void
  notify: Notify
}) {
  const index = Math.max(0, config.accessories.findIndex((a) => a.uid === instance.uid))
  const resolved = useMemo(() => resolveAccessory(instance, config, inProject ? index : config.accessories.length), [instance, config, inProject, index])
  const [selected, setSelected] = useState<string | null>(null)
  const [advanced, setAdvanced] = useState(false)
  const [mode, setMode] = useState<'2d' | '3d'>('2d')
  const solids = useMemo(() => (resolved ? accessorySolids(resolved.build.parts) : []), [resolved])
  if (!resolved) return null
  const { def } = resolved
  const table = tablePattern(config)
  const setParam = (key: string, v: number | string | boolean) => onChange({ ...instance, params: { ...instance.params, [key]: v } })
  const setPattern = (patch: Partial<AccessoryInstance['pattern']>) => onChange({ ...instance, pattern: { ...instance.pattern, ...patch } })
  const main = def.params.filter((p) => p.group !== 'avancado')
  const adv = def.params.filter((p) => p.group === 'avancado')
  const sel = resolved.bom.find((b) => b.code === selected) ?? null

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      <aside className="space-y-3 lg:w-[340px] lg:shrink-0 lg:overflow-y-auto lg:pr-1">
        <button type="button" className="btn-ghost -ml-2" onClick={onBack}>
          <Icon name="back" /> Todos os acessórios
        </button>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{def.category}</p>
          <h2 className="text-lg font-semibold text-ink">{def.name}</h2>
          <p className="text-sm text-muted">{def.description}</p>
        </div>

        <div className="card space-y-3 p-4">
          <Toggle
            label="Usar padrão de furos da minha mesa"
            checked={instance.useTablePattern}
            onChange={(v) => onChange({ ...instance, useTablePattern: v, pattern: v || !table ? instance.pattern : { ...table } })}
            help={HELP.pattern}
            description={table ? `Ø${n(table.diameter)} mm · passo ${n(table.pitchX)} × ${n(table.pitchY)} mm` : 'A mesa está sem furos.'}
            testId="use-table-pattern"
          />
          {!instance.useTablePattern && (
            <>
              <NumberField label="Diâmetro dos furos da mesa" value={instance.pattern.diameter} onChange={(v) => setPattern({ diameter: v })} help={HELP.diameter} />
              <Grid2>
                <NumberField label="Passo X" value={instance.pattern.pitchX} onChange={(v) => setPattern({ pitchX: v })} help={HELP.pitch} />
                <NumberField label="Passo Y" value={instance.pattern.pitchY} onChange={(v) => setPattern({ pitchY: v })} />
              </Grid2>
            </>
          )}
        </div>

        <div className="card space-y-3 p-4">
          {main.map((s) => (
            <ParamField key={s.key} spec={s} value={instance.params[s.key]} onChange={(v) => setParam(s.key, v)} />
          ))}
          <button type="button" className="flex w-full items-center gap-1 text-xs font-medium text-accent" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
            <Icon name="down" className={`h-3.5 w-3.5 transition-transform ${advanced ? '' : '-rotate-90'}`} /> Ajustes avançados
          </button>
          {advanced && adv.map((s) => <ParamField key={s.key} spec={s} value={instance.params[s.key]} onChange={(v) => setParam(s.key, v)} />)}
          {advanced && (
            <button type="button" className="text-xs text-muted underline" onClick={() => onChange({ ...instance, params: { ...def.defaults } })}>
              Restaurar valores do modelo original
            </button>
          )}
        </div>

        <div className="card flex items-end gap-3 p-4">
          <div className="flex-1">
            <NumberField label="Quantidade" unit="un." integer min={1} value={instance.quantity} onChange={(v) => onChange({ ...instance, quantity: v })} testId="accessory-qty" />
          </div>
          {inProject ? (
            <span className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ok">
              <Icon name="check" /> No projeto
            </span>
          ) : (
            <button type="button" className="btn-primary" onClick={onAdd} disabled={!resolved.canExport} data-testid="add-accessory">
              <Icon name="plus" /> Adicionar ao projeto
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Visualização do acessório" className="flex rounded-lg bg-line/60 p-1">
            <button role="tab" type="button" className="tab" aria-selected={mode === '2d'} onClick={() => setMode('2d')}>
              Peças (2D)
            </button>
            <button role="tab" type="button" className="tab" aria-selected={mode === '3d'} onClick={() => setMode('3d')} data-testid="accessory-tab-3d">
              Montagem (3D)
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <StatusBar issues={resolved.issues} subject="Acessório" />
          </div>
        </div>
        <div className="card relative h-[55vh] min-h-[320px] overflow-hidden lg:h-auto lg:flex-1">
          {mode === '3d' ? (
            <Suspense fallback={<p className="p-6 text-sm text-muted">Carregando visualização 3D…</p>}>
              <Viewer3D solids={solids} fitKey={`${def.id}|${resolved.build.dimensions.map((d) => Math.round(d.value)).join(',')}`} />
            </Suspense>
          ) : (
          <PartsView
            items={resolved.bom.map((b) => ({ key: b.code, title: `${b.description.split(' — ')[1]} · ${b.quantity / Math.max(1, instance.quantity)}×`, subtitle: `${n(b.length)} × ${n(b.height)} · chapa ${n(b.thickness)} mm`, geometry: b.geometry }))}
            selected={selected}
            onSelect={setSelected}
            showGrid={false}
            showDims
            fitKey={`${def.id}|${resolved.bom.map((b) => `${Math.round(b.length)}x${Math.round(b.height)}`).join(',')}`}
          />
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-4 text-sm">
            <h3 className="mb-2 font-semibold text-ink">Dimensões e peças</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {resolved.build.dimensions.map((d) => (
                <div key={d.label} className="contents">
                  <dt className="text-muted">{d.label}</dt>
                  <dd className="text-right tabular-nums text-ink">{n(d.value)} mm</dd>
                </div>
              ))}
              <dt className="text-muted">Chapas por conjunto</dt>
              <dd className="text-right tabular-nums text-ink">{resolved.build.parts.length}</dd>
            </dl>
            {resolved.build.assembly && (
              <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-ink-soft">
                {resolved.build.assembly.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-muted">Baseado no modelo "{def.fusionSource}" do Fusion 360, recalculado para estes parâmetros.</p>
          </div>
          <div className="card space-y-2 p-4 text-sm">
            <h3 className="font-semibold text-ink">Arquivos</h3>
            <button type="button" className="btn-primary w-full" disabled={!resolved.canExport} onClick={() => downloadAccessoryZip(resolved, notify)} data-testid="accessory-zip">
              <Icon name="download" /> Baixar acessório completo
            </button>
            <button type="button" className="btn w-full" disabled={!resolved.canExport || !sel} onClick={() => sel && downloadItemDxf(sel, notify)}>
              <Icon name="file" /> {sel ? `Baixar DXF: ${sel.description.split(' — ')[1]}` : 'Selecione uma peça para baixar só o DXF'}
            </button>
            <p className="text-[11px] leading-relaxed text-muted">
              Um DXF por chapa diferente; peças iguais aparecem com a quantidade. STEP ainda não é gerado, porque precisaria de sólidos 3D que correspondam a estes parâmetros.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AccessoriesPage({ config, setConfig, notify }: { config: ProjectConfig; setConfig: (f: (c: ProjectConfig) => ProjectConfig) => void; notify: Notify }) {
  const [draft, setDraft] = useState<AccessoryInstance | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const previews = useMemo(
    () => Object.fromEntries(ACCESSORIES.map((d) => [d.id, resolveAccessory(createAccessoryInstance(d.id, config), config)])),
    // miniaturas acompanham só o padrão de furos da mesa
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.top.holes.enabled, config.top.holes.diameter, config.top.holes.pitchX, config.top.holes.pitchY],
  )
  const editingInstance = editing ? config.accessories.find((a) => a.uid === editing) : null

  if (editingInstance) {
    return (
      <Configurator
        instance={editingInstance}
        config={config}
        inProject
        onChange={(i) => setConfig((c) => ({ ...c, accessories: c.accessories.map((a) => (a.uid === i.uid ? i : a)) }))}
        onAdd={() => {}}
        onBack={() => setEditing(null)}
        notify={notify}
      />
    )
  }
  if (draft) {
    return (
      <Configurator
        instance={draft}
        config={config}
        inProject={false}
        onChange={setDraft}
        onAdd={() => {
          setConfig((c) => ({ ...c, accessories: [...c.accessories, draft] }))
          setEditing(draft.uid)
          setDraft(null)
          notify('Acessório adicionado ao projeto.')
        }}
        onBack={() => setDraft(null)}
        notify={notify}
      />
    )
  }

  return (
    <div className="space-y-6 overflow-y-auto pb-8">
      <div>
        <h2 className="text-lg font-semibold text-ink">Acessórios</h2>
        <p className="text-sm text-muted">Gerados para o padrão de furos da sua mesa. Cada um pode ser baixado sozinho ou incluído no pacote do projeto.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="accessories">
        {ACCESSORIES.map((d) => {
          const pv = previews[d.id]
          return (
            <article key={d.id} className="card flex flex-col overflow-hidden" data-testid={`accessory-card-${d.id}`}>
              <div className="h-36 border-b border-line bg-canvas p-3">
                <Thumbnail resolved={pv} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{d.category}</p>
                <h3 className="font-semibold leading-tight text-ink">{d.name}</h3>
                <p className="flex-1 text-sm text-muted">{d.description}</p>
                {pv && (
                  <p className="text-xs tabular-nums text-ink-soft">
                    {pv.build.dimensions.filter((x) => !x.label.startsWith('Espessura')).map((x) => n(x.value)).join(' × ')} mm · chapa {n(Number(d.defaults.thickness))} mm · {pv.build.parts.length} chapa{pv.build.parts.length > 1 ? 's' : ''}
                  </p>
                )}
                <button type="button" className="btn mt-1" onClick={() => setDraft(createAccessoryInstance(d.id, config))} data-testid={`configure-${d.id}`}>
                  <Icon name="sliders" /> Configurar
                </button>
              </div>
            </article>
          )
        })}
      </div>

      <section className="card p-4">
        <h3 className="mb-2 font-semibold text-ink">No seu projeto</h3>
        {config.accessories.length === 0 ? (
          <p className="text-sm text-muted">Nenhum acessório incluído. Configure um modelo e clique em "Adicionar ao projeto".</p>
        ) : (
          <ul className="divide-y divide-line">
            {config.accessories.map((a, i) => {
              const r = resolveAccessory(a, config, i)
              const def = accessoryById(a.typeId)
              return (
                <li key={a.uid} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="font-mono text-xs text-muted">A{i + 1}</span>
                  <span className="flex-1 text-sm text-ink">
                    {def?.name} <span className="text-muted">· {a.quantity} un.</span>
                  </span>
                  {r && !r.canExport && <span className="text-xs font-medium text-bad">com erro</span>}
                  <button type="button" className="btn" onClick={() => setEditing(a.uid)}>
                    Editar
                  </button>
                  <button type="button" className="btn-ghost text-bad" aria-label={`Remover ${def?.name}`} onClick={() => setConfig((c) => ({ ...c, accessories: c.accessories.filter((x) => x.uid !== a.uid) }))}>
                    <Icon name="trash" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
