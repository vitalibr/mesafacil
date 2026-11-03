import type { ResolvedAccessory } from '../engine/accessories'
import type { BomItem, GeneratedProject, ProjectConfig } from '../engine/types'

/** Densidade usada apenas na estimativa de massa (aço carbono). */
export const STEEL_DENSITY_KG_MM3 = 7.85e-6

export const DISCLAIMER =
  'Os desenhos são gerados conforme os parâmetros informados. Antes da fabricação, confira as medidas, espessuras, folgas e requisitos estruturais com o responsável pelo projeto e com a empresa de corte.'

const num = (v: number, digits = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits })

export const fmtMm = (v: number) => `${num(v)} mm`

export function projectBaseName(p: GeneratedProject): string {
  const { length, width } = p.config.top
  return `MesaFacil_${Math.round(length)}x${Math.round(width)}`
}

export function usesJoints(c: ProjectConfig): boolean {
  return (c.sides.enabled && c.sides.slotIntoTop) || (c.ribs.enabled && (c.ribs.slotIntoTop || (c.sides.enabled && c.ribs.slotIntoSides) || (c.ribs.layout === 'grid' && c.ribs.interlock)))
}

export function estimatedMassKg(item: BomItem): number {
  return item.netArea * item.thickness * STEEL_DENSITY_KG_MM3
}

// ---------------------------------------------------------------------------

function csvCell(v: string | number): string {
  const s = typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false }) : v
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Lista de peças em CSV no padrão brasileiro do Excel: separador ";",
 * vírgula decimal, UTF-8 com BOM e quebras de linha CRLF.
 */
export function bomToCsv(p: GeneratedProject, accessories: ResolvedAccessory[] = []): string {
  return itemsToCsv([...p.bom, ...accessories.flatMap((a) => a.bom)])
}

export function itemsToCsv(items: BomItem[]): string {
  const header = [
    'Código',
    'Descrição',
    'Quantidade',
    'Comprimento (mm)',
    'Largura ou altura (mm)',
    'Espessura (mm)',
    'Furos por peça',
    'Área líquida por peça (m²)',
    'Massa estimada por peça em aço (kg)',
    'Arquivo DXF',
  ]
  const rows = items.map((b) => [
    b.code,
    b.description,
    b.quantity,
    b.length,
    b.height,
    b.thickness,
    b.holeCount,
    b.netArea / 1e6,
    estimatedMassKg(b),
    b.fileName,
  ])
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------

export function quoteRequestText(p: GeneratedProject, accessories: ResolvedAccessory[] = []): string {
  const c = p.config
  const material = c.quote.material.trim() || 'a definir (gostaria de receber sugestões)'
  const lines = [
    'Assunto: Solicitação de orçamento — Corte a laser — Mesa de solda',
    '',
    'Olá, tudo bem?',
    '',
    'Gostaria de solicitar um orçamento para fabricação das peças de uma mesa de solda.',
    '',
    'DIMENSÕES DO PROJETO',
    `Tampo: ${num(c.top.length)} × ${num(c.top.width)} mm`,
    `Espessura: ${num(c.top.thickness)} mm`,
  ]
  if (c.top.holes.enabled && p.stats.topHoleCount > 0) {
    lines.push(
      `Furos: Ø${num(c.top.holes.diameter)} mm (${p.stats.topHoleCount.toLocaleString('pt-BR')} furos)`,
      `Espaçamento: ${num(c.top.holes.pitchX)} × ${num(c.top.holes.pitchY)} mm`,
    )
  }
  lines.push(`Material: ${material}`, '', 'RELAÇÃO DE PEÇAS')
  const line = (b: BomItem) =>
    `${b.fileName} — ${b.quantity} ${b.quantity === 1 ? 'unidade' : 'unidades'} — chapa ${num(b.thickness)} mm (${num(b.length)} × ${num(b.height)} mm)`
  for (const b of p.bom) lines.push(line(b))
  if (accessories.length) {
    lines.push('', 'ACESSÓRIOS')
    for (const a of accessories) {
      lines.push(`${a.def.name} — ${a.instance.quantity} ${a.instance.quantity === 1 ? 'conjunto' : 'conjuntos'}:`)
      for (const b of a.bom) lines.push(`  ${line(b)}`)
    }
  }
  lines.push(
    '',
    'Os arquivos DXF estão em escala 1:1, com unidades em milímetros. A geometria está nas medidas nominais finais, sem compensação de corte (kerf).',
  )
  if (usesJoints(c)) {
    lines.push(`As peças têm encaixes com folga nominal de ${num(c.joints.clearance)} mm; por favor, confirmem se essa folga é adequada ao seu processo.`)
  }
  if (c.quote.notes.trim()) lines.push('', 'OBSERVAÇÕES', c.quote.notes.trim())
  lines.push(
    '',
    'Gostaria de receber um orçamento considerando o fornecimento do material e o serviço de corte a laser.',
    'Por favor, informar o prazo de fabricação e as condições de pagamento.',
    '',
    'Obrigado!',
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------

export function technicalSpecText(p: GeneratedProject, generatedAt = new Date(), accessories: ResolvedAccessory[] = []): string {
  const c = p.config
  const yes = (v: boolean) => (v ? 'sim' : 'não')
  const L: string[] = [
    'MESAFÁCIL — ESPECIFICAÇÕES TÉCNICAS',
    `Gerado em ${generatedAt.toLocaleString('pt-BR')}`,
    '',
    'UNIDADES E FORMATO',
    '- Todas as medidas em milímetros (mm). DXF em escala 1:1, camada CORTE.',
    '- Cada peça está em coordenadas locais próprias, com o canto inferior esquerdo da caixa envolvente em (0, 0).',
    '- A geometria representa as medidas nominais finais. Não há compensação de largura de corte (kerf):',
    '  a empresa de corte deve aplicar a compensação de ferramenta e confirmar as tolerâncias dos encaixes.',
    '',
    'TAMPO',
    `- Dimensões: ${fmtMm(c.top.length)} × ${fmtMm(c.top.width)}, espessura ${fmtMm(c.top.thickness)}`,
  ]
  if (c.top.holes.enabled) {
    L.push(
      `- Furos: Ø${fmtMm(c.top.holes.diameter)}, passo ${fmtMm(c.top.holes.pitchX)} (X) × ${fmtMm(c.top.holes.pitchY)} (Y), ${p.stats.topHoleCount} furos`,
      c.top.holes.mode === 'auto'
        ? `- Distribuição automática centralizada, margem mínima do centro à borda ${fmtMm(c.top.holes.minMargin)}`
        : `- Distribuição manual: primeiro furo a ${fmtMm(c.top.holes.startX)} da borda esquerda e ${fmtMm(c.top.holes.startY)} da borda inferior`,
    )
  } else {
    L.push('- Sem furos')
  }
  if (c.sides.enabled) {
    const arr = { all: 'quatro lados', long: 'apenas lados maiores', short: 'apenas lados menores' }[c.sides.arrangement]
    L.push(
      '',
      'LATERAIS',
      `- ${arr}; altura ${fmtMm(c.sides.height)}, espessura ${fmtMm(c.sides.thickness)}, recuo ${fmtMm(c.sides.setback)} da borda do tampo`,
      '- Convenção dos cantos: laterais longas externas, laterais curtas entre elas, encontro de topo.',
      `- Encaixe no tampo: ${yes(c.sides.slotIntoTop)}`,
      `- Furos nas laterais: ${c.sides.holes.enabled ? `Ø${fmtMm(c.sides.holes.diameter)}, passo ${fmtMm(c.sides.holes.pitchX)} × ${fmtMm(c.sides.holes.pitchY)}, margem ${fmtMm(c.sides.holes.margin)}` : 'não'}`,
    )
  }
  if (c.ribs.enabled) {
    const lay = { longitudinal: 'apenas longitudinais', transverse: 'apenas transversais', grid: 'grade cruzada' }[c.ribs.layout]
    L.push(
      '',
      'REFORÇOS INFERIORES',
      `- ${lay}; altura ${fmtMm(c.ribs.height)}, espessura ${fmtMm(c.ribs.thickness)}`,
      `- Quantidade: ${c.ribs.layout !== 'transverse' ? `${c.ribs.countLongitudinal} longitudinal(is)` : ''}${c.ribs.layout === 'grid' ? ' e ' : ''}${c.ribs.layout !== 'longitudinal' ? `${c.ribs.countTransverse} transversal(is)` : ''}`,
      `- Alinhados entre linhas de furos: ${yes(c.ribs.alignBetweenHoles && c.top.holes.enabled)}`,
      `- Encaixe no tampo: ${yes(c.ribs.slotIntoTop)}`,
      `- Encaixe nas laterais: ${yes(c.sides.enabled && c.ribs.slotIntoSides)}${c.sides.enabled && c.ribs.slotIntoSides ? ' (aba no meio da altura do reforço atravessando a lateral, rente à face externa)' : ''}`,
    )
    if (c.ribs.layout === 'grid') {
      L.push(
        c.ribs.interlock
          ? '- Encaixe entre reforços: rasgos de meia altura; longitudinais com rasgo aberto para baixo, transversais com rasgo aberto para cima. Monte primeiro os transversais e desça os longitudinais sobre eles.'
          : '- Sem encaixe entre reforços: os longitudinais seguem inteiros e os transversais são divididos em trechos soldados de topo entre eles.',
      )
    }
  }
  if (usesJoints(c)) {
    L.push(
      '',
      'ENCAIXES',
      `- Folga total: ${fmtMm(c.joints.clearance)}. Largura do rasgo = espessura da chapa que entra + folga; comprimento do rasgo = largura da aba + folga.`,
      `- Abas: largura ${fmtMm(c.joints.tabWidth)}, profundidade igual à espessura do tampo (${fmtMm(c.top.thickness)}), ficando rentes à face superior.`,
      `- Espaçamento máximo entre abas ${fmtMm(c.joints.tabSpacing)}; distância mínima às extremidades ${fmtMm(c.joints.tabEndDistance)}.`,
      `- Material mínimo entre rasgos, furos e bordas: ${fmtMm(c.joints.minWeb)}.`,
    )
  }
  L.push('', 'LISTA DE PEÇAS')
  for (const b of p.bom) {
    L.push(`- ${b.code} ${b.description}: ${b.quantity} un., ${fmtMm(b.length)} × ${fmtMm(b.height)}, chapa ${fmtMm(b.thickness)} — ${b.fileName}`)
  }
  if (accessories.length) {
    L.push('', 'ACESSÓRIOS')
    for (const a of accessories) L.push(...accessorySpecLines(a))
  }
  const allItems = [...p.bom, ...accessories.flatMap((a) => a.bom)]
  const total = allItems.reduce((s, b) => s + estimatedMassKg(b) * b.quantity, 0)
  L.push(`- Massa total ESTIMADA considerando aço carbono (7,85 g/cm³): ${num(total, 1)} kg`)
  const warnings = p.issues.filter((i) => i.severity === 'warning')
  if (warnings.length) {
    L.push('', 'AVISOS')
    for (const w of warnings) L.push(`- ${w.message}`)
  }
  L.push(
    '',
    'OBSERVAÇÕES',
    '- As validações do MesaFácil são geométricas (peças fechadas, sem sobreposições, com material mínimo entre recortes).',
    '  Elas não avaliam resistência mecânica nem capacidade de carga da mesa.',
    `- ${DISCLAIMER}`,
    '',
  )
  return L.join('\r\n')
}

function accessorySpecLines(a: ResolvedAccessory): string[] {
  const pat = a.pattern
  const L = [
    `- ${a.def.name} (${a.instance.quantity} conjunto(s)) — padrão de furação Ø${num(pat.diameter)} mm, passo ${num(pat.pitchX)} × ${num(pat.pitchY)} mm${a.instance.useTablePattern ? ' (o mesmo da mesa)' : ' (personalizado)'}`,
    `  Dimensões: ${a.build.dimensions.map((d) => `${d.label.toLowerCase()} ${fmtMm(d.value)}`).join(', ')}`,
  ]
  for (const b of a.bom) L.push(`  ${b.code} ${b.description}: ${b.quantity} un., ${fmtMm(b.length)} × ${fmtMm(b.height)}, chapa ${fmtMm(b.thickness)} — ${b.fileName}`)
  for (const s of a.build.assembly ?? []) L.push(`  Montagem: ${s}`)
  for (const i of a.issues.filter((x) => x.severity === 'warning')) L.push(`  Aviso: ${i.message}`)
  return L
}

/** Especificações de um acessório baixado sozinho. */
export function accessorySpecText(a: ResolvedAccessory, generatedAt = new Date()): string {
  return [
    `MESAFÁCIL — ${a.def.name.toUpperCase()}`,
    `Gerado em ${generatedAt.toLocaleString('pt-BR')}`,
    '',
    'Medidas em milímetros, DXF em escala 1:1, camada CORTE, sem compensação de corte (kerf).',
    `Baseado no modelo "${a.def.fusionSource}" do projeto Mesa de Solda (Fusion 360), recalculado para os parâmetros abaixo.`,
    '',
    ...accessorySpecLines(a),
    '',
    `- ${DISCLAIMER}`,
    '',
  ].join('\r\n')
}
