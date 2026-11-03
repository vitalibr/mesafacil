import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveAccessories } from './engine/accessories'
import { createDefaultConfig } from './engine/defaults'
import { parseProject, serializeProject } from './engine/serialize'
import type { ProjectConfig } from './engine/types'
import { DISCLAIMER, projectBaseName } from './export/documents'
import { AccessoriesPage } from './ui/Accessories'
import { makeActions, type Notify } from './ui/actions'
import { ConfigPanel } from './ui/ConfigPanel'
import { CreatorBadge, CreatorModal } from './ui/Creator'
import { creatorDue, markCreatorShown } from './ui/creatorInfo'
import { PartsView, TopView } from './ui/Drawings'
import { Help } from './ui/fields'
import { HELP } from './ui/helpTexts'
import { Icon } from './ui/icons'
import { StatusBar } from './ui/Status'
import { downloadText, storage } from './ui/storage'
import { Summary } from './ui/Summary'
import { TUTORIAL_KEY, Tutorial, type TourPage, type TourPane } from './ui/Tutorial'
import { useProject, type Updater } from './ui/useProject'
import { track } from './ui/analytics'
import { tableSolids } from './ui/solids'

const Viewer3D = lazy(() => import('./ui/Viewer3D'))

type Pane = TourPane
type Page = TourPage

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" className="fill-ink" />
      {[9, 16, 23].flatMap((x) => [9, 16, 23].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" className={x === 23 && y === 9 ? 'fill-accent' : 'fill-white'} />))}
    </svg>
  )
}

function useIsDesktop() {
  const query = '(min-width: 1024px)'
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return match
}

function useToast() {
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error'; id: number } | null>(null)
  const notify: Notify = useCallback((message, tone = 'ok') => setToast({ message, tone, id: Date.now() }), [])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(t)
  }, [toast])
  const node = toast && (
    <div role="status" aria-live="polite" className={`fixed bottom-20 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg lg:bottom-6 ${toast.tone === 'ok' ? 'bg-ink' : 'bg-bad'}`} data-testid="toast">
      <Icon name={toast.tone === 'ok' ? 'check' : 'error'} /> {toast.message}
    </div>
  )
  return { notify, node }
}

function ExportMenu({ actions, items }: { actions: ReturnType<typeof makeActions>; items: { code: string; fileName: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const run = (f: () => void) => () => {
    setOpen(false)
    f()
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-tour="export" data-testid="export-menu">
        <Icon name="download" /> <span className="hidden sm:inline">Exportar</span>
        <Icon name="down" className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl">
          {actions.blocked && <p className="border-b border-line px-3 py-2 text-xs text-bad">Corrija os erros do projeto para exportar.</p>}
          <button role="menuitem" type="button" className="menu-item" onClick={run(actions.zip)} disabled={actions.blocked} data-testid="menu-zip">
            <Icon name="package" /> Baixar projeto completo (ZIP)
          </button>
          <button role="menuitem" type="button" className="menu-item" onClick={run(actions.csv)} disabled={actions.blocked}>
            <Icon name="table" /> Lista de peças (CSV)
          </button>
          <button role="menuitem" type="button" className="menu-item" onClick={run(actions.quote)} disabled={actions.blocked}>
            <Icon name="copy" /> Copiar pedido de orçamento
          </button>
          <p className="mt-1 flex items-center gap-1 border-t border-line px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            DXF individual <Help label="O que é DXF? E DWG?">{HELP.dxf} {HELP.dwg}</Help>
          </p>
          <div className="max-h-56 overflow-y-auto">
            {items.map((it) => (
              <button key={it.code} role="menuitem" type="button" className="menu-item font-mono text-xs" onClick={run(it.onClick)} disabled={actions.blocked}>
                <Icon name="file" /> {it.fileName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Faixa sempre visível sob o desenho: números do projeto e as ações principais. */
function SummaryStrip({ project, itemsCount, uniqueCount, actions, onOpen, summaryOpen }: { project: ReturnType<typeof useProject>['project']; itemsCount: number; uniqueCount: number; actions: ReturnType<typeof makeActions>; onOpen: () => void; summaryOpen: boolean }) {
  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2" data-testid="summary-strip">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums text-ink">{project.stats.topHoleCount.toLocaleString('pt-BR')}</span> <span className="text-muted">furos</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums text-ink">{itemsCount}</span> <span className="text-muted">peças ({uniqueCount} diferentes)</span>
        </span>
        {!summaryOpen && (
          <button type="button" className="hidden items-center gap-1 text-sm font-medium text-accent hover:underline lg:inline-flex" onClick={onOpen} data-testid="open-summary">
            Ver lista de peças <Icon name="chevron" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <span className="flex-1" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={actions.quote} disabled={actions.blocked} data-tour="quote">
          <Icon name="copy" /> <span className="hidden sm:inline">Copiar pedido de orçamento</span><span className="sm:hidden">Pedido</span>
        </button>
        <button type="button" className="btn-primary" onClick={actions.zip} disabled={actions.blocked}>
          <Icon name="download" /> <span className="hidden sm:inline">Baixar projeto completo</span><span className="sm:hidden">ZIP</span>
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const { config, setConfig, project } = useProject()
  const accessories = useMemo(() => resolveAccessories(config), [config])
  const { notify, node: toast } = useToast()
  const actions = useMemo(() => makeActions(project, accessories, notify), [project, accessories, notify])
  const [page, setPage] = useState<Page>('mesa')
  const [pane, setPane] = useState<Pane>('view')
  const [viewTab, setViewTab] = useState<'top' | 'parts' | '3d' | 'summary'>('top')
  const [showGrid, setShowGrid] = useState(false)
  const [showDims, setShowDims] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [tutorial, setTutorial] = useState(() => storage.get(TUTORIAL_KEY) === null)
  // divulgação do criador: ao abrir a página, no máximo uma vez por dia; na primeira
  // visita aparece logo depois do tutorial, nunca junto com ele
  const [creator, setCreator] = useState(() => !tutorial && creatorDue())
  useEffect(() => {
    if (creator) markCreatorShown()
  }, [creator])
  const fileInput = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()

  const update: Updater = useCallback((section, patch) => setConfig((c) => ({ ...c, [section]: { ...c[section], ...patch } })), [setConfig])

  const newProject = () => {
    if (window.confirm('Começar um novo projeto a partir do exemplo? As alterações atuais serão descartadas.')) {
      setConfig(createDefaultConfig())
      setSelected(null)
      notify('Exemplo padrão restaurado.')
    }
  }
  const saveProject = () => {
    downloadText(serializeProject(config), `${projectBaseName(project)}.json`, 'application/json')
    track('salvar-projeto')
    notify('Projeto salvo.')
  }
  const loadProject = async (file: File) => {
    if (file.size > 2_000_000) return notify('Arquivo grande demais para um projeto do MesaFácil.', 'error')
    const r = parseProject(await file.text())
    if (!r.ok) return notify(r.error, 'error')
    setConfig(r.config as ProjectConfig)
    setSelected(null)
    track('carregar-projeto')
    notify(r.notices.length ? `Projeto carregado (${r.notices.length} campo(s) completados com o padrão).` : 'Projeto carregado.')
  }

  const selectedItem = project.bom.find((b) => b.code === selected) ?? null
  const solids3d = useMemo(() => tableSolids(project.parts), [project.parts])
  const allItems = [...project.bom, ...accessories.flatMap((a) => a.bom)]
  const totalItems = allItems.reduce((t, b) => t + b.quantity, 0)
  const uniqueItems = allItems.length
  const dxfItems = [...project.bom, ...accessories.flatMap((a) => a.bom)].map((b) => ({ code: b.code, fileName: b.fileName, onClick: () => actions.dxf(b) }))

  const viewer = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Visualização" className="flex rounded-lg bg-line/60 p-1" data-tour="viewer-tabs">
          <button role="tab" type="button" className="tab" aria-selected={viewTab === 'top'} onClick={() => setViewTab('top')} data-testid="tab-top">
            Vista superior
          </button>
          <button role="tab" type="button" className="tab" aria-selected={viewTab === 'parts'} onClick={() => setViewTab('parts')} data-testid="tab-parts">
            Peças para corte
          </button>
          <button role="tab" type="button" className="tab" aria-selected={viewTab === '3d'} onClick={() => {
              setViewTab('3d')
              track('abrir-3d', 'mesa')
            }} data-testid="tab-3d">
            3D
          </button>
          <button role="tab" type="button" className="tab hidden lg:block" aria-selected={viewTab === 'summary'} onClick={() => setViewTab('summary')} data-testid="tab-summary">
            Resumo do projeto
          </button>
        </div>
        <span className="flex-1" />
        {viewTab !== '3d' && viewTab !== 'summary' && (
          <>
        <button type="button" className={`btn-ghost ${showGrid ? 'text-accent' : ''}`} aria-pressed={showGrid} onClick={() => setShowGrid((g) => !g)}>
          <Icon name="grid" /> Grade
        </button>
        <button type="button" className={`btn-ghost ${showDims ? 'text-accent' : ''}`} aria-pressed={showDims} onClick={() => setShowDims((d) => !d)}>
          <Icon name="ruler" /> Cotas
        </button>
          </>
        )}
      </div>
      <StatusBar issues={project.issues} />
      <div className={`card relative min-h-[320px] flex-1 ${viewTab === 'summary' ? 'overflow-y-auto p-4' : 'overflow-hidden'}`} data-testid="viewer">
        {viewTab === 'summary' && isDesktop ? (
          <Summary project={project} accessories={accessories} actions={actions} />
        ) : viewTab === '3d' ? (
          <Suspense fallback={<p className="p-6 text-sm text-muted">Carregando visualização 3D…</p>}>
            <Viewer3D solids={solids3d} fitKey={`${Math.round(config.top.length)}|${Math.round(config.top.width)}|${project.parts.length}`} />
          </Suspense>
        ) : viewTab === 'top' ? (
          <TopView project={project} showGrid={showGrid} showDims={showDims} />
        ) : (
          <PartsView
            items={project.bom.map((b) => ({ key: b.code, title: `${b.code} · ${b.description} · ${b.quantity}×`, subtitle: `${b.length.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} × ${b.height.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm · chapa ${b.thickness.toLocaleString('pt-BR')} mm`, geometry: b.geometry }))}
            selected={selected}
            onSelect={setSelected}
            showGrid={showGrid}
            showDims={showDims}
            fitKey={`parts|${project.bom.map((b) => `${Math.round(b.length)}x${Math.round(b.height)}`).join(',')}`}
          />
        )}
        {viewTab === 'parts' && selectedItem && (
          <div className="absolute left-3 top-3 max-w-[calc(100%-5rem)] rounded-xl border border-line bg-surface/95 p-3 text-sm shadow-md backdrop-blur" data-testid="part-details">
            <div className="flex items-start gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {selectedItem.code} · {selectedItem.description}
                </p>
                <p className="text-xs tabular-nums text-muted">
                  {selectedItem.quantity} un. · {selectedItem.length.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} × {selectedItem.height.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mm · chapa {selectedItem.thickness.toLocaleString('pt-BR')} mm · {selectedItem.holeCount} furos
                </p>
              </div>
              <button type="button" className="text-muted hover:text-ink" aria-label="Fechar detalhes" onClick={() => setSelected(null)}>
                <Icon name="close" />
              </button>
            </div>
            <button type="button" className="btn mt-2" onClick={() => actions.dxf(selectedItem)} disabled={actions.blocked}>
              <Icon name="download" /> Baixar {selectedItem.fileName}
            </button>
          </div>
        )}
      </div>
      <SummaryStrip project={project} itemsCount={totalItems} uniqueCount={uniqueItems} actions={actions} onOpen={() => setViewTab('summary')} summaryOpen={viewTab === 'summary'} />
    </div>
  )

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-40 flex items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:gap-3 sm:px-4">
        <div className="flex items-center gap-2">
          <Logo />
          <div className="leading-tight">
            <h1 className="sr-only text-[15px] font-semibold tracking-tight text-ink min-[460px]:not-sr-only">MesaFácil</h1>
            <p className="hidden text-[11px] text-muted xl:block">Projete sua mesa de solda e gere arquivos para corte a laser.</p>
          </div>
        </div>
        <nav className="flex shrink-0 rounded-lg bg-line/60 p-1 sm:ml-3" aria-label="Seções">
          <button type="button" className="tab" aria-selected={page === 'mesa'} onClick={() => setPage('mesa')} data-testid="nav-mesa">
            Mesa
          </button>
          <button type="button" className="tab" aria-selected={page === 'acessorios'} onClick={() => setPage('acessorios')} data-tour="nav-accessories" data-testid="nav-accessories">
            Acessórios{config.accessories.length > 0 && <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] text-white">{config.accessories.length}</span>}
          </button>
        </nav>
        <span className="flex-1" />
        <CreatorBadge onClick={() => setCreator(true)} />
        <button type="button" className="btn-ghost px-2" onClick={() => setTutorial(true)} title="Como usar o MesaFácil" aria-label="Como usar o MesaFácil" data-testid="help">
          <Icon name="help" /> <span className="hidden 2xl:inline">Como usar o MesaFácil</span>
        </button>
        <div className="hidden items-center gap-1 md:flex">
          <button type="button" className="btn-ghost" onClick={newProject} data-testid="new-project">
            <Icon name="file" /> <span className="hidden lg:inline">Novo projeto</span>
          </button>
          <button type="button" className="btn-ghost" onClick={saveProject} data-testid="save-project">
            <Icon name="save" /> <span className="hidden lg:inline">Salvar projeto</span>
          </button>
          <button type="button" className="btn-ghost" onClick={() => fileInput.current?.click()} data-testid="load-project">
            <Icon name="open" /> <span className="hidden lg:inline">Carregar projeto</span>
          </button>
        </div>
        <ExportMenu actions={actions} items={dxfItems} />
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          data-testid="load-input"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void loadProject(f)
          }}
        />
      </header>

      {page === 'mesa' ? (
        <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className={`${pane === 'params' ? 'block' : 'hidden'} min-h-0 overflow-y-auto border-line bg-page p-3 lg:block lg:w-[30%] lg:min-w-[340px] lg:max-w-[440px] lg:border-r lg:p-4`} aria-label="Parâmetros do projeto">
            <ConfigPanel config={config} update={update} holeCount={project.stats.topHoleCount} />
            <div className="mt-3 grid grid-cols-3 gap-2 md:hidden">
              <button type="button" className="btn text-xs" onClick={newProject}>
                Novo
              </button>
              <button type="button" className="btn text-xs" onClick={saveProject}>
                Salvar
              </button>
              <button type="button" className="btn text-xs" onClick={() => fileInput.current?.click()}>
                Carregar
              </button>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-muted">{DISCLAIMER}</p>
            <p className="mt-2 text-[11px] text-muted">
              Criado por{' '}
              <button type="button" className="font-medium text-ink-soft underline" onClick={() => setCreator(true)}>
                VM Garage
              </button>{' '}
              · gratuito e de código aberto
            </p>
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
            <section className={`${pane === 'view' ? 'flex' : 'hidden'} h-full min-h-0 flex-col p-3 lg:flex lg:p-4`} aria-label="Desenho">
              {viewer}
            </section>
            {!isDesktop && pane === 'summary' && (
              <div className="p-3">
                <Summary project={project} accessories={accessories} actions={actions} />
              </div>
            )}
          </div>
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:overflow-hidden lg:p-4">
          <AccessoriesPage config={config} setConfig={setConfig} notify={notify} />
        </main>
      )}

      {page === 'mesa' && (
        <nav className="grid grid-cols-3 border-t border-line bg-surface lg:hidden" aria-label="Painéis">
          {(
            [
              ['params', 'sliders', 'Parâmetros'],
              ['view', 'layers', 'Desenho'],
              ['summary', 'table', 'Resumo'],
            ] as const
          ).map(([k, icon, label]) => (
            <button key={k} type="button" onClick={() => setPane(k)} aria-pressed={pane === k} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${pane === k ? 'text-accent' : 'text-muted'}`} data-testid={`pane-${k}`}>
              <Icon name={icon} className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>
      )}

      <Tutorial
        open={tutorial}
        onClose={(result) => {
          track(result === 'concluido' ? 'tutorial-concluido' : 'tutorial-pulado')
          setTutorial(false)
          if (creatorDue()) setCreator(true)
        }}
        onNavigate={(pg, pn) => {
          if (pg) setPage(pg)
          if (pn) setPane(pn)
        }}
      />
      <CreatorModal open={creator && !tutorial} onClose={() => setCreator(false)} />
      {toast}
    </div>
  )
}
