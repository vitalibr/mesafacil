import type { ProjectConfig } from '../engine/types'
import { Grid2, NumberField, Section, Segmented, TextField, Toggle } from './fields'
import { HELP } from './helpTexts'
import type { Updater } from './useProject'

interface Props {
  config: ProjectConfig
  update: Updater
  holeCount: number
}

export function ConfigPanel({ config: c, update, holeCount }: Props) {
  const top = c.top
  const holes = top.holes
  const setHoles = (patch: Partial<typeof holes>) => update('top', { holes: { ...holes, ...patch } })
  const sides = c.sides
  const setSideHoles = (patch: Partial<typeof sides.holes>) => update('sides', { holes: { ...sides.holes, ...patch } })
  const ribs = c.ribs
  const j = c.joints
  const jointsUsed = (sides.enabled && sides.slotIntoTop) || (ribs.enabled && (ribs.slotIntoTop || ribs.slotIntoSides || (ribs.layout === 'grid' && ribs.interlock)))

  return (
    <div className="space-y-3">
      <Section title="Tampo" icon="layers" tour="top">
        <Grid2>
          <NumberField label="Comprimento" value={top.length} onChange={(v) => update('top', { length: v })} help={HELP.length} testId="top-length" />
          <NumberField label="Largura" value={top.width} onChange={(v) => update('top', { width: v })} help={HELP.width} testId="top-width" />
        </Grid2>
        <NumberField label="Espessura da chapa" value={top.thickness} onChange={(v) => update('top', { thickness: v })} help={HELP.thickness} testId="top-thickness" />
      </Section>

      <Section
        title="Furos do tampo"
        icon="grid"
        tour="holes"
        aside={<span className="rounded-full bg-page px-2 py-0.5 text-xs tabular-nums text-muted" data-testid="hole-count">{holeCount.toLocaleString('pt-BR')} furos</span>}
      >
        <Toggle label="Furar o tampo" checked={holes.enabled} onChange={(v) => setHoles({ enabled: v })} />
        {holes.enabled && (
          <>
            <NumberField label="Diâmetro dos furos" value={holes.diameter} onChange={(v) => setHoles({ diameter: v })} help={HELP.diameter} testId="hole-diameter" />
            <Grid2>
              <NumberField label="Espaçamento em X" value={holes.pitchX} onChange={(v) => setHoles({ pitchX: v })} help={HELP.pitch} testId="pitch-x" />
              <NumberField label="Espaçamento em Y" value={holes.pitchY} onChange={(v) => setHoles({ pitchY: v })} help={HELP.pitch} testId="pitch-y" />
            </Grid2>
            <Segmented
              label="Distribuição"
              value={holes.mode}
              onChange={(v) => setHoles({ mode: v })}
              help={HELP.autoMode}
              options={[
                { value: 'auto', label: 'Automática' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
            {holes.mode === 'auto' ? (
              <NumberField label="Margem mínima (centro à borda)" value={holes.minMargin} onChange={(v) => setHoles({ minMargin: v })} help={HELP.margin} />
            ) : (
              <>
                <Grid2>
                  <NumberField label="1º furo até a borda esquerda" value={holes.startX} onChange={(v) => setHoles({ startX: v })} help={HELP.margin} />
                  <NumberField label="1º furo até a borda inferior" value={holes.startY} onChange={(v) => setHoles({ startY: v })} help={HELP.margin} />
                </Grid2>
                <NumberField label="Margem mínima na borda oposta" value={holes.minMargin} onChange={(v) => setHoles({ minMargin: v })} />
              </>
            )}
          </>
        )}
      </Section>

      <Section title="Laterais" icon="package" tour="sides" defaultOpen>
        <Toggle label="Adicionar laterais" checked={sides.enabled} onChange={(v) => update('sides', { enabled: v })} help={HELP.sides} testId="sides-toggle" />
        {sides.enabled && (
          <>
            <Segmented
              label="Lados"
              value={sides.arrangement}
              onChange={(v) => update('sides', { arrangement: v })}
              options={[
                { value: 'all', label: 'Quatro lados' },
                { value: 'long', label: 'Lados maiores' },
                { value: 'short', label: 'Lados menores' },
              ]}
            />
            <Grid2>
              <NumberField label="Altura" value={sides.height} onChange={(v) => update('sides', { height: v })} />
              <NumberField label="Espessura" value={sides.thickness} onChange={(v) => update('sides', { thickness: v })} help={HELP.thickness} />
            </Grid2>
            <NumberField label="Recuo da borda do tampo" value={sides.setback} onChange={(v) => update('sides', { setback: v })} help={HELP.setback} />
            <Toggle label="Encaixar laterais no tampo" checked={sides.slotIntoTop} onChange={(v) => update('sides', { slotIntoTop: v })} help={HELP.slotIntoTop} />
            <Toggle label="Furos nas laterais" checked={sides.holes.enabled} onChange={(v) => setSideHoles({ enabled: v })} />
            {sides.holes.enabled && (
              <>
                <NumberField label="Diâmetro" value={sides.holes.diameter} onChange={(v) => setSideHoles({ diameter: v })} help={HELP.diameter} />
                <Grid2>
                  <NumberField label="Espaçamento horizontal" value={sides.holes.pitchX} onChange={(v) => setSideHoles({ pitchX: v })} help={HELP.pitch} />
                  <NumberField label="Espaçamento vertical" value={sides.holes.pitchY} onChange={(v) => setSideHoles({ pitchY: v })} />
                </Grid2>
                <NumberField label="Margem mínima" value={sides.holes.margin} onChange={(v) => setSideHoles({ margin: v })} help={HELP.margin} />
              </>
            )}
          </>
        )}
      </Section>

      <Section title="Reforços inferiores" icon="table" tour="ribs">
        <Toggle label="Adicionar reforços inferiores" checked={ribs.enabled} onChange={(v) => update('ribs', { enabled: v })} help={HELP.ribs} testId="ribs-toggle" />
        {ribs.enabled && (
          <>
            <Segmented
              label="Configuração"
              value={ribs.layout}
              onChange={(v) => update('ribs', { layout: v })}
              options={[
                { value: 'longitudinal', label: 'Longitudinais' },
                { value: 'transverse', label: 'Transversais' },
                { value: 'grid', label: 'Grade' },
              ]}
            />
            <Grid2>
              {ribs.layout !== 'transverse' && (
                <NumberField label="Qtd. longitudinais" unit="" integer min={1} value={ribs.countLongitudinal} onChange={(v) => update('ribs', { countLongitudinal: v })} testId="ribs-count-l" />
              )}
              {ribs.layout !== 'longitudinal' && (
                <NumberField label="Qtd. transversais" unit="" integer min={1} value={ribs.countTransverse} onChange={(v) => update('ribs', { countTransverse: v })} testId="ribs-count-t" />
              )}
            </Grid2>
            <Grid2>
              <NumberField label="Altura" value={ribs.height} onChange={(v) => update('ribs', { height: v })} />
              <NumberField label="Espessura" value={ribs.thickness} onChange={(v) => update('ribs', { thickness: v })} help={HELP.thickness} />
            </Grid2>
            {(!sides.enabled || sides.arrangement !== 'all') && (
              <NumberField label="Recuo das pontas (sem lateral)" value={ribs.endSetback} onChange={(v) => update('ribs', { endSetback: v })} hint="Usado nos lados em que não há lateral." />
            )}
            <Toggle label="Alinhar entre linhas de furos" checked={ribs.alignBetweenHoles} onChange={(v) => update('ribs', { alignBetweenHoles: v })} help={HELP.align} />
            {ribs.layout === 'grid' && <Toggle label="Encaixes entre reforços" checked={ribs.interlock} onChange={(v) => update('ribs', { interlock: v })} help={HELP.interlock} />}
            <Toggle label="Encaixar reforços no tampo" checked={ribs.slotIntoTop} onChange={(v) => update('ribs', { slotIntoTop: v })} help={HELP.slotIntoTop} />
            {sides.enabled && (
              <Toggle label="Encaixar reforços nas laterais" checked={ribs.slotIntoSides} onChange={(v) => update('ribs', { slotIntoSides: v })} help={HELP.slotIntoSides} testId="ribs-into-sides" />
            )}
          </>
        )}
      </Section>

      <Section title="Encaixes e montagem" icon="tool" defaultOpen={false} tour="joints">
        {!jointsUsed && <p className="text-xs text-muted">Nenhum encaixe ativo. Ative "Encaixar no tampo" nas laterais ou nos reforços.</p>}
        <NumberField label="Folga de montagem" value={j.clearance} step={0.1} onChange={(v) => update('joints', { clearance: v })} help={HELP.clearance} hint="Rasgo = espessura da peça + folga." />
        <Grid2>
          <NumberField label="Largura das abas" value={j.tabWidth} onChange={(v) => update('joints', { tabWidth: v })} help={HELP.tabs} />
          <NumberField label="Espaço máx. entre abas" value={j.tabSpacing} onChange={(v) => update('joints', { tabSpacing: v })} />
        </Grid2>
        <Grid2>
          <NumberField label="Aba até a ponta" value={j.tabEndDistance} onChange={(v) => update('joints', { tabEndDistance: v })} />
          <NumberField label="Material mínimo" value={j.minWeb} step={0.5} onChange={(v) => update('joints', { minWeb: v })} help={HELP.minWeb} />
        </Grid2>
        <p className="text-xs text-muted">
          A profundidade das abas é igual à espessura do tampo ({Number.isFinite(top.thickness) ? top.thickness.toLocaleString('pt-BR') : '–'} mm): elas ficam rentes à face de cima. A folga não inclui a compensação do laser (kerf).
        </p>
      </Section>

      <Section title="Pedido de orçamento" icon="file" defaultOpen={false}>
        <TextField
          label="Material"
          value={c.quote.material}
          onChange={(v) => update('quote', { material: v })}
          placeholder="A definir com a empresa de corte"
          help={HELP.material}
          list={['Aço carbono SAE 1020', 'Aço carbono ASTM A36', 'Aço inoxidável 304', 'Alumínio 5052']}
        />
        <TextField label="Observações" value={c.quote.notes} onChange={(v) => update('quote', { notes: v })} multiline placeholder="Ex.: preciso das peças até o dia 20." />
      </Section>
    </div>
  )
}
