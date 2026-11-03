import { buildBom, KIND_LABEL } from './bom'
import { CircleIndex, EPS, expandRect, rectCircleGap, rectGap, rectOverlapArea, rectPolygon, rectToPolygon } from './geom'
import { autoGridPositions, gapMidpoints, manualGridPositions } from './holes'
import { plateRectXY, verticalPlacement, verticalPlateOutline, type EdgeFeature, type EndTab } from './plate'
import { placeTabs, type Interval } from './tabs'
import type {
  Circle,
  GeneratedPart,
  GeneratedProject,
  PartInstance,
  PartKind,
  ProjectConfig,
  Rect,
  Severity,
  ValidationIssue,
} from './types'
import { validatePartGeometry } from './validateGeometry'

/** Limites desta versão para manter a interface responsiva. */
export const MAX_TOP_HOLES = 20000
export const WARN_TOP_HOLES = 6000
export const MAX_DIMENSION = 10000
export const MAX_RIBS_PER_DIRECTION = 50

const mm = (v: number) => `${Number(v.toFixed(2)).toLocaleString('pt-BR')} mm`

/** Chapa vertical (lateral ou reforço) antes da montagem do contorno. */
interface VerticalPiece {
  id: string
  kind: PartKind
  name: string
  length: number
  height: number
  thickness: number
  placement: PartInstance
  wantTabs: boolean
  top: EdgeFeature[]
  bottom: EdgeFeature[]
  holes: Circle[]
  /** Abas nas pontas (reforços encaixados nas laterais). */
  ends: { start?: EndTab; end?: EndTab }
  /** Rasgos internos em coordenadas locais (laterais que recebem reforços). */
  cutouts: Rect[]
}

class Issues {
  readonly list: ValidationIssue[] = []
  add(severity: Severity, code: string, message: string, markers?: Rect[]) {
    this.list.push({ severity, code, message, markers })
  }
  error(code: string, message: string, markers?: Rect[]) {
    this.add('error', code, message, markers)
  }
  warn(code: string, message: string, markers?: Rect[]) {
    this.add('warning', code, message, markers)
  }
  get hasErrors() {
    return this.list.some((i) => i.severity === 'error')
  }
}

// ---------------------------------------------------------------------------
// Validação dos valores informados

function checkNumbers(c: ProjectConfig, issues: Issues) {
  const positive = (v: number, label: string, max = MAX_DIMENSION) => {
    if (!Number.isFinite(v)) issues.error('value', `${label}: informe um número.`)
    else if (v <= 0) issues.error('value', `${label} deve ser maior que zero.`)
    else if (v > max) issues.error('value', `${label} acima do limite de ${mm(max)}.`)
  }
  const nonNegative = (v: number, label: string) => {
    if (!Number.isFinite(v)) issues.error('value', `${label}: informe um número.`)
    else if (v < 0) issues.error('value', `${label} não pode ser negativo.`)
    else if (v > MAX_DIMENSION) issues.error('value', `${label} acima do limite de ${mm(MAX_DIMENSION)}.`)
  }
  const count = (v: number, label: string) => {
    if (!Number.isInteger(v) || v < 1) issues.error('value', `${label} deve ser um número inteiro maior ou igual a 1.`)
    else if (v > MAX_RIBS_PER_DIRECTION) issues.error('value', `${label} acima do limite de ${MAX_RIBS_PER_DIRECTION}.`)
  }

  positive(c.top.length, 'Comprimento do tampo')
  positive(c.top.width, 'Largura do tampo')
  positive(c.top.thickness, 'Espessura do tampo', 100)
  const h = c.top.holes
  if (h.enabled) {
    positive(h.diameter, 'Diâmetro dos furos do tampo')
    positive(h.pitchX, 'Espaçamento dos furos em X')
    positive(h.pitchY, 'Espaçamento dos furos em Y')
    nonNegative(h.minMargin, 'Margem mínima dos furos')
    if (h.mode === 'manual') {
      positive(h.startX, 'Distância do primeiro furo à borda esquerda')
      positive(h.startY, 'Distância do primeiro furo à borda inferior')
    }
  }
  const s = c.sides
  if (s.enabled) {
    positive(s.height, 'Altura das laterais')
    positive(s.thickness, 'Espessura das laterais', 100)
    nonNegative(s.setback, 'Recuo das laterais')
    if (s.holes.enabled) {
      positive(s.holes.diameter, 'Diâmetro dos furos laterais')
      positive(s.holes.pitchX, 'Espaçamento horizontal dos furos laterais')
      positive(s.holes.pitchY, 'Espaçamento vertical dos furos laterais')
      nonNegative(s.holes.margin, 'Margem dos furos laterais')
    }
  }
  const r = c.ribs
  if (r.enabled) {
    positive(r.height, 'Altura dos reforços')
    positive(r.thickness, 'Espessura dos reforços', 100)
    nonNegative(r.endSetback, 'Recuo das extremidades dos reforços')
    if (r.layout !== 'transverse') count(r.countLongitudinal, 'Quantidade de reforços longitudinais')
    if (r.layout !== 'longitudinal') count(r.countTransverse, 'Quantidade de reforços transversais')
  }
  const j = c.joints
  const usesJoints = (s.enabled && s.slotIntoTop) || (r.enabled && (r.slotIntoTop || r.slotIntoSides || (r.layout === 'grid' && r.interlock)))
  if (usesJoints) {
    nonNegative(j.clearance, 'Folga de montagem')
    positive(j.tabWidth, 'Largura das abas')
    positive(j.tabSpacing, 'Espaçamento entre abas')
    nonNegative(j.tabEndDistance, 'Distância das abas às extremidades')
    nonNegative(j.minWeb, 'Material mínimo entre recortes')
    if (Number.isFinite(j.clearance) && j.clearance > 3) {
      issues.warn('clearance', `Folga de montagem de ${mm(j.clearance)} é alta; o encaixe ficará solto.`)
    }
  }
}

// ---------------------------------------------------------------------------
// Furos do tampo

function topHoles(c: ProjectConfig, issues: Issues): { circles: Circle[]; xs: number[]; ys: number[] } {
  const { length: L, width: W, thickness: T } = c.top
  const h = c.top.holes
  const minWeb = c.joints.minWeb
  if (!h.enabled) return { circles: [], xs: [], ys: [] }
  const r = h.diameter / 2

  if (h.diameter >= h.pitchX - EPS) {
    issues.error('holes-overlap-x', `O diâmetro dos furos (${mm(h.diameter)}) é maior ou igual ao espaçamento em X (${mm(h.pitchX)}): os furos ficariam sobrepostos.`)
  } else if (h.pitchX - h.diameter < minWeb) {
    issues.warn('holes-web-x', `Sobram apenas ${mm(h.pitchX - h.diameter)} de material entre furos em X.`)
  }
  if (h.diameter >= h.pitchY - EPS) {
    issues.error('holes-overlap-y', `O diâmetro dos furos (${mm(h.diameter)}) é maior ou igual ao espaçamento em Y (${mm(h.pitchY)}): os furos ficariam sobrepostos.`)
  } else if (h.pitchY - h.diameter < minWeb) {
    issues.warn('holes-web-y', `Sobram apenas ${mm(h.pitchY - h.diameter)} de material entre furos em Y.`)
  }

  const edge = (dist: number, label: string) => {
    if (dist <= r + EPS) {
      issues.error('holes-edge', `${label} (${mm(dist)}) precisa ser maior que o raio do furo (${mm(r)}); caso contrário o furo corta a borda.`)
    } else if (dist - r < minWeb) {
      issues.warn('holes-edge-web', `${label}: sobram apenas ${mm(dist - r)} entre o furo e a borda.`)
    }
  }
  edge(h.minMargin, h.mode === 'auto' ? 'A margem mínima dos furos' : 'A margem mínima na borda oposta')
  if (h.mode === 'manual') {
    edge(h.startX, 'A distância do primeiro furo à borda esquerda')
    edge(h.startY, 'A distância do primeiro furo à borda inferior')
  }
  if (h.diameter < T) {
    issues.warn('holes-small', `Furos de ${mm(h.diameter)} são menores que a espessura da chapa (${mm(T)}); confirme a viabilidade com a empresa de corte.`)
  }
  if (issues.hasErrors) return { circles: [], xs: [], ys: [] }

  const xs = h.mode === 'auto' ? autoGridPositions(L, h.pitchX, h.minMargin) : manualGridPositions(L, h.pitchX, h.startX, h.minMargin)
  const ys = h.mode === 'auto' ? autoGridPositions(W, h.pitchY, h.minMargin) : manualGridPositions(W, h.pitchY, h.startY, h.minMargin)
  const total = xs.length * ys.length
  if (total === 0) {
    issues.warn('holes-none', 'Nenhum furo cabe no tampo com as margens informadas.')
    return { circles: [], xs: [], ys: [] }
  }
  if (total > MAX_TOP_HOLES) {
    issues.error('holes-too-many', `A configuração gera ${total.toLocaleString('pt-BR')} furos; o limite desta versão é ${MAX_TOP_HOLES.toLocaleString('pt-BR')}.`)
    return { circles: [], xs: [], ys: [] }
  }
  if (total > WARN_TOP_HOLES) {
    issues.warn('holes-many', `${total.toLocaleString('pt-BR')} furos: a visualização pode ficar mais lenta.`)
  }
  const circles: Circle[] = []
  for (const x of xs) for (const y of ys) circles.push({ x, y, r })
  return { circles, xs, ys }
}

// ---------------------------------------------------------------------------
// Laterais

interface Frame {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

function sidePieces(c: ProjectConfig, issues: Issues, pieces: VerticalPiece[]): Frame {
  const { length: L, width: W } = c.top
  const s = c.sides
  const e = c.ribs.endSetback
  const frame: Frame = { xMin: e, xMax: L - e, yMin: e, yMax: W - e }
  if (!s.enabled) return frame

  const { setback: r, thickness: t, height: H } = s
  const hasLong = s.arrangement !== 'short'
  const hasShort = s.arrangement !== 'long'
  const longLen = L - 2 * r
  const shortLen = W - 2 * r - (hasLong ? 2 * t : 0)

  if (hasLong && W - 2 * r - 2 * t <= EPS) {
    issues.error('sides-fit', 'As laterais longas não cabem na largura do tampo com o recuo e a espessura informados.')
    return frame
  }
  if (hasShort && L - 2 * r - 2 * t <= EPS) {
    issues.error('sides-fit', 'As laterais curtas não cabem no comprimento do tampo com o recuo e a espessura informados.')
    return frame
  }
  if ((hasLong && longLen <= EPS) || (hasShort && shortLen <= EPS)) {
    issues.error('sides-fit', 'O recuo das laterais é grande demais para as dimensões do tampo.')
    return frame
  }

  const holes = sideHoles(c, issues)
  const make = (id: string, kind: PartKind, name: string, length: number, placement: PartInstance): VerticalPiece => ({
    id,
    kind,
    name,
    length,
    height: H,
    thickness: t,
    placement,
    wantTabs: s.slotIntoTop,
    top: [],
    bottom: [],
    holes: holes(length, name),
    ends: {},
    cutouts: [],
  })

  // Convenção dos cantos: laterais longas externas, com o comprimento total
  // (descontado o recuo); laterais curtas entre as longas, encontro de topo.
  if (hasLong) {
    pieces.push(make('side-long-1', 'sideLong', 'Lateral longa (frente)', longLen, verticalPlacement('Lateral longa (frente)', [r, r, -H], 'x')))
    pieces.push(make('side-long-2', 'sideLong', 'Lateral longa (fundo)', longLen, verticalPlacement('Lateral longa (fundo)', [r, W - r - t, -H], 'x')))
  }
  if (hasShort) {
    const y0 = hasLong ? r + t : r
    pieces.push(make('side-short-1', 'sideShort', 'Lateral curta (esquerda)', shortLen, verticalPlacement('Lateral curta (esquerda)', [r, y0, -H], 'y')))
    pieces.push(make('side-short-2', 'sideShort', 'Lateral curta (direita)', shortLen, verticalPlacement('Lateral curta (direita)', [L - r - t, y0, -H], 'y')))
  }
  if (hasShort) {
    frame.xMin = r + t
    frame.xMax = L - r - t
  }
  if (hasLong) {
    frame.yMin = r + t
    frame.yMax = W - r - t
  }
  return frame
}

function sideHoles(c: ProjectConfig, issues: Issues): (length: number, name: string) => Circle[] {
  const s = c.sides
  const h = s.holes
  if (!h.enabled) return () => []
  const r = h.diameter / 2
  let ok = true
  if (h.diameter >= h.pitchX - EPS || h.diameter >= h.pitchY - EPS) {
    issues.error('side-holes-overlap', `O diâmetro dos furos laterais (${mm(h.diameter)}) é maior ou igual ao espaçamento: os furos ficariam sobrepostos.`)
    ok = false
  }
  if (h.margin <= r + EPS) {
    issues.error('side-holes-edge', `A margem dos furos laterais (${mm(h.margin)}) precisa ser maior que o raio do furo (${mm(r)}).`)
    ok = false
  } else if (h.margin - r < c.joints.minWeb) {
    issues.warn('side-holes-edge-web', `Furos laterais: sobram apenas ${mm(h.margin - r)} entre o furo e a borda da chapa.`)
  }
  if (!ok) return () => []
  const ys = autoGridPositions(s.height, h.pitchY, h.margin)
  const reported = new Set<string>()
  return (length, name) => {
    const xs = autoGridPositions(length, h.pitchX, h.margin)
    if (xs.length * ys.length === 0) {
      const key = name.split(' (')[0]
      if (!reported.has(key)) issues.warn('side-holes-none', `Nenhum furo cabe na ${key.toLowerCase()} com a margem informada.`)
      reported.add(key)
      return []
    }
    const out: Circle[] = []
    for (const x of xs) for (const y of ys) out.push({ x, y, r })
    return out
  }
}

// ---------------------------------------------------------------------------
// Reforços

/**
 * Centros uniformemente distribuídos no intervalo [lo, hi]; opcionalmente
 * deslocados para o vão livre entre linhas de furos mais próximo.
 */
function ribCenters(
  n: number,
  lo: number,
  hi: number,
  t: number,
  gaps: number[] | null,
  minWeb: number,
  label: string,
  issues: Issues,
): number[] | null {
  const ideal = Array.from({ length: n }, (_, i) => lo + ((i + 1) * (hi - lo)) / (n + 1))
  let centers = ideal
  if (gaps) {
    const options = gaps.filter((g) => g - t / 2 >= lo + minWeb - EPS && g + t / 2 <= hi - minWeb + EPS)
    if (options.length < n) {
      issues.error('ribs-gaps', `Há apenas ${options.length} vão(s) livres entre linhas de furos para ${n} ${label}. Reduza a quantidade ou desative o alinhamento entre furos.`)
      return null
    }
    // atribuição em ordem: cada reforço pega o vão livre mais próximo à direita do anterior
    centers = []
    let from = 0
    for (let i = 0; i < n; i++) {
      const remaining = n - i
      let best = from
      for (let k = from; k <= options.length - remaining; k++) {
        if (Math.abs(options[k] - ideal[i]) < Math.abs(options[best] - ideal[i]) - EPS) best = k
      }
      centers.push(options[best])
      from = best + 1
    }
  }
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]
    if (c - t / 2 <= lo + EPS || c + t / 2 >= hi - EPS) {
      issues.error('ribs-fit', `Os ${label} não cabem no espaço interno disponível.`)
      return null
    }
    if (i > 0 && c - centers[i - 1] < t + minWeb - EPS) {
      issues.error('ribs-close', `Os ${label} ficariam a menos de ${mm(minWeb)} uns dos outros. Reduza a quantidade.`)
      return null
    }
  }
  return centers
}

function ribPieces(
  c: ProjectConfig,
  frame: Frame,
  grid: { xs: number[]; ys: number[] },
  issues: Issues,
  pieces: VerticalPiece[],
) {
  const rb = c.ribs
  if (!rb.enabled) return
  const { thickness: t, height: H } = rb
  const { xMin, xMax, yMin, yMax } = frame
  const minWeb = c.joints.minWeb
  const clearance = c.joints.clearance
  if (xMax - xMin <= t + EPS || yMax - yMin <= t + EPS) {
    issues.error('ribs-space', 'Não há espaço interno para os reforços com o recuo e as laterais informados.')
    return
  }
  const hasL = rb.layout !== 'transverse'
  const hasT = rb.layout !== 'longitudinal'
  const align = rb.alignBetweenHoles && c.top.holes.enabled
  const cL = hasL ? ribCenters(rb.countLongitudinal, yMin, yMax, t, align ? gapMidpoints(grid.ys) : null, minWeb, 'reforços longitudinais', issues) : []
  const cT = hasT ? ribCenters(rb.countTransverse, xMin, xMax, t, align ? gapMidpoints(grid.xs) : null, minWeb, 'reforços transversais', issues) : []
  if (!cL || !cT) return

  const interlock = hasL && hasT && rb.interlock
  const notchW = t + clearance
  const notchesAt = (centersLocal: number[], length: number, label: string): EdgeFeature[] | null => {
    const out = centersLocal.map((x) => ({ a: x - notchW / 2, b: x + notchW / 2, kind: 'notch' as const, depth: H / 2 }))
    for (let i = 0; i < out.length; i++) {
      const tooCloseToEnd = out[i].a < minWeb - EPS || length - out[i].b < minWeb - EPS
      const tooCloseToPrev = i > 0 && out[i].a - out[i - 1].b < minWeb - EPS
      if (tooCloseToEnd || tooCloseToPrev) {
        issues.error('ribs-notch', `Encaixe entre reforços muito próximo ${tooCloseToEnd ? 'da extremidade' : 'de outro encaixe'} no ${label}.`)
        return null
      }
    }
    return out
  }

  cL.forEach((y, i) => {
    const length = xMax - xMin
    const name = `Reforço longitudinal ${i + 1}`
    const bottom = interlock ? notchesAt(cT.map((x) => x - xMin), length, name.toLowerCase()) : []
    if (!bottom) return
    pieces.push({
      id: `rib-l-${i + 1}`,
      kind: 'ribLongitudinal',
      name,
      length,
      height: H,
      thickness: t,
      placement: verticalPlacement(name, [xMin, y - t / 2, -H], 'x'),
      wantTabs: rb.slotIntoTop,
      top: [],
      bottom,
      holes: [],
      ends: {},
      cutouts: [],
    })
  })

  cT.forEach((x, k) => {
    // Sem encaixe na grade cruzada, os transversais são divididos em trechos
    // entre os longitudinais (que seguem inteiros) para não haver sobreposição.
    const spans: [number, number][] = []
    if (hasL && !interlock) {
      let from = yMin
      for (const y of cL) {
        spans.push([from, y - t / 2])
        from = y + t / 2
      }
      spans.push([from, yMax])
    } else {
      spans.push([yMin, yMax])
    }
    spans.forEach(([y0, y1], si) => {
      const length = y1 - y0
      const name = spans.length > 1 ? `Reforço transversal ${k + 1}.${si + 1}` : `Reforço transversal ${k + 1}`
      const top = interlock ? notchesAt(cL.map((y) => y - yMin), length, name.toLowerCase()) : []
      if (!top) return
      pieces.push({
        id: spans.length > 1 ? `rib-t-${k + 1}-${si + 1}` : `rib-t-${k + 1}`,
        kind: 'ribTransverse',
        name,
        length,
        height: H,
        thickness: t,
        placement: verticalPlacement(name, [x - t / 2, y0, -H], 'y'),
        wantTabs: rb.slotIntoTop,
        top,
        bottom: [],
        holes: [],
        ends: {},
        cutouts: [],
      })
    })
  })
}

// ---------------------------------------------------------------------------
// Encaixe das pontas dos reforços nas laterais

/**
 * Cada ponta de reforço encostada numa lateral recebe uma aba no meio da
 * altura do reforço, que atravessa a lateral e fica rente à face externa.
 * A lateral recebe o rasgo correspondente: largura = espessura do reforço +
 * folga, altura = altura da aba + folga.
 */
function ribSideJoints(c: ProjectConfig, pieces: VerticalPiece[], issues: Issues) {
  const { sides: s, ribs: rb, joints: j } = c
  if (!s.enabled || !rb.enabled || !rb.slotIntoSides) return
  const sidesList = pieces.filter((p) => p.kind === 'sideLong' || p.kind === 'sideShort')
  const ribs = pieces.filter((p) => p.kind === 'ribLongitudinal' || p.kind === 'ribTransverse')
  const tabH = Math.min(j.tabWidth, rb.height / 2)
  const yMid = rb.height / 2
  let joined = 0
  for (const rib of ribs) {
    const u = rib.placement.u
    const o = rib.placement.origin
    const along = u[0] === 1 ? 0 : 1
    const other = 1 - along
    const center = o[other] + rib.thickness / 2
    for (const which of ['start', 'end'] as const) {
      const at = o[along] + (which === 'start' ? 0 : rib.length)
      // lateral cuja face interna coincide com esta ponta
      const side = sidesList.find((sd) => {
        if (sd.placement.u[along] === 1) return false // lateral paralela ao reforço
        const face0 = sd.placement.origin[along]
        const face1 = face0 + sd.thickness
        return Math.abs((which === 'start' ? face1 : face0) - at) < 1e-6
      })
      if (!side) continue
      const s0 = center - side.placement.origin[other] // posição ao longo da lateral
      const ySide = side.height - rib.height + yMid // centro da aba na altura da lateral
      const slot: Rect = {
        x0: s0 - (rib.thickness + j.clearance) / 2,
        x1: s0 + (rib.thickness + j.clearance) / 2,
        y0: ySide - (tabH + j.clearance) / 2,
        y1: ySide + (tabH + j.clearance) / 2,
      }
      if (slot.y0 < j.minWeb || slot.y1 > side.height - j.minWeb || slot.x0 < j.minWeb || slot.x1 > side.length - j.minWeb) {
        issues.error('rib-side-joint', `O encaixe do "${rib.name}" na "${side.name}" não cabe na lateral. Aumente a altura das laterais ou desative o encaixe dos reforços nas laterais.`)
        return
      }
      side.cutouts.push(slot)
      rib.ends[which] = { y0: yMid - tabH / 2, y1: yMid + tabH / 2, depth: side.thickness }
      joined++
    }
  }
  if (!joined) issues.warn('rib-side-none', 'Nenhum reforço encosta numa lateral; o encaixe nas laterais não foi aplicado.')
}

// ---------------------------------------------------------------------------
// Abas e rasgos no tampo

const REASON_TEXT: Record<string, string> = {
  edge: 'a borda do tampo',
  hole: 'os furos do tampo',
  slot: 'os rasgos de outras peças',
  notch: 'os encaixes entre reforços',
  spacing: 'as abas vizinhas',
}

function placeAllTabs(c: ProjectConfig, pieces: VerticalPiece[], holeIndex: CircleIndex, issues: Issues): Rect[] {
  const { length: L, width: W, thickness: T } = c.top
  const { clearance, tabWidth, tabSpacing, tabEndDistance, minWeb } = c.joints
  const slots: Rect[] = []
  const tooShort = new Set<string>()

  for (const piece of pieces) {
    if (!piece.wantTabs) continue
    const keepOut: Interval[] = piece.top.filter((f) => f.kind === 'notch')
    const check = (a: number, b: number): string | null => {
      for (const k of keepOut) if (a < k.b + minWeb - EPS && b > k.a - minWeb + EPS) return 'notch'
      const slot = plateRectXY(piece.placement, a, b, piece.thickness, clearance / 2)
      if (slot.x0 < minWeb - EPS || slot.y0 < minWeb - EPS || slot.x1 > L - minWeb + EPS || slot.y1 > W - minWeb + EPS) return 'edge'
      for (const h of holeIndex.query(expandRect(slot, minWeb))) if (rectCircleGap(slot, h) < minWeb - EPS) return 'hole'
      for (const s of slots) if (rectGap(slot, s) < minWeb - EPS) return 'slot'
      return null
    }
    const res = placeTabs({
      length: piece.length,
      tabWidth,
      spacing: tabSpacing,
      endDistance: tabEndDistance,
      minGap: minWeb + clearance,
      check,
    })
    if (res.tooShort) {
      tooShort.add(piece.name)
      continue
    }
    if (res.failures.length) {
      const reasons = [...new Set(res.failures)].map((r) => REASON_TEXT[r] ?? r).join(' e ')
      issues.error(
        'tabs-placement',
        `Não foi possível posicionar ${res.failures.length} aba(s) da peça "${piece.name}" sem interferir com ${reasons}. Ajuste a posição da peça, a largura das abas ou desative o encaixe no tampo.`,
        [plateRectXY(piece.placement, 0, piece.length, piece.thickness)],
      )
      continue
    }
    for (const tab of res.tabs) {
      piece.top.push({ a: tab.a, b: tab.b, kind: 'tab', depth: T })
      slots.push(plateRectXY(piece.placement, tab.a, tab.b, piece.thickness, clearance / 2))
    }
  }
  if (tooShort.size) {
    issues.warn(
      'tabs-short',
      `Peças curtas demais para receber abas (comprimento mínimo ${mm(2 * tabEndDistance + tabWidth)}): ${[...tooShort].join(', ')}. Elas serão apenas posicionadas e soldadas.`,
    )
  }
  return slots
}

// ---------------------------------------------------------------------------

function interlocked(a: VerticalPiece, b: VerticalPiece, c: ProjectConfig): boolean {
  const kinds = new Set([a.kind, b.kind])
  return c.ribs.interlock && kinds.has('ribLongitudinal') && kinds.has('ribTransverse')
}

/** Gera todas as peças, a validação e a lista de peças a partir da configuração. */
export function generateProject(config: ProjectConfig): GeneratedProject {
  const issues = new Issues()
  checkNumbers(config, issues)
  const { length: L, width: W, thickness: T } = config.top
  const parts: GeneratedPart[] = []
  const topValid = [L, W, T].every((v) => Number.isFinite(v) && v > 0 && v <= MAX_DIMENSION)

  if (issues.hasErrors) {
    if (topValid) parts.push(topPart(config, [], []))
    return finish(config, parts, issues)
  }

  const grid = topHoles(config, issues)
  const holeIndex = new CircleIndex(grid.circles)
  const pieces: VerticalPiece[] = []
  const frame = sidePieces(config, issues, pieces)
  ribPieces(config, frame, grid, issues, pieces)
  if (!issues.hasErrors) ribSideJoints(config, pieces, issues)
  const slots = issues.hasErrors ? [] : placeAllTabs(config, pieces, holeIndex, issues)

  parts.push(topPart(config, grid.circles, slots))
  for (const p of pieces) {
    parts.push({
      id: p.id,
      kind: p.kind,
      name: p.name,
      thickness: p.thickness,
      geometry: { outer: verticalPlateOutline(p.length, p.height, p.top, p.bottom, p.ends), holes: p.holes, cutouts: p.cutouts.map(rectToPolygon) },
      placement: p.placement,
    })
  }

  // Sobreposição de volumes entre chapas verticais na vista superior
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]
      const b = pieces[j]
      if (interlocked(a, b, config)) continue
      const ra = plateRectXY(a.placement, 0, a.length, a.thickness)
      const rb = plateRectXY(b.placement, 0, b.length, b.thickness)
      if (rectOverlapArea(ra, rb) > 1e-3) {
        issues.error('overlap', `As peças "${a.name}" e "${b.name}" ocupam o mesmo espaço.`, [ra, rb])
      }
    }
  }

  // Furos do tampo que ficam sobre laterais ou reforços
  const obstructed = new Map<string, Rect[]>()
  for (const p of pieces) {
    const fp = plateRectXY(p.placement, 0, p.length, p.thickness)
    for (const h of holeIndex.query(fp)) {
      if (rectCircleGap(fp, h) < -EPS) {
        const key = p.kind.startsWith('side') ? 'laterais' : 'reforços'
        const list = obstructed.get(key) ?? []
        list.push({ x0: h.x - h.r, y0: h.y - h.r, x1: h.x + h.r, y1: h.y + h.r })
        obstructed.set(key, list)
      }
    }
  }
  for (const [key, markers] of obstructed) {
    issues.warn(
      'holes-obstructed',
      `${markers.length} furo(s) do tampo ficam sobre ${key} e serão parcialmente obstruídos por baixo.${key === 'reforços' ? ' Ative "Alinhar entre linhas de furos" para evitar.' : ' Ajuste o recuo para posicionar as laterais entre as linhas de furos.'}`,
      markers.slice(0, 500),
    )
  }

  // Conferência final da geometria de cada peça
  for (const part of parts) {
    // laterais com rasgos também conferem o material mínimo até os furos laterais
    const problems = validatePartGeometry(part.geometry, part.kind !== 'top' && part.geometry.cutouts.length ? { minWeb: config.joints.minWeb } : {})
    if (problems.length) {
      issues.error('geometry-invalid', `Geometria inválida em "${part.name}": ${problems.join('; ')}.`)
    }
  }
  return finish(config, parts, issues)
}

function topPart(c: ProjectConfig, holes: Circle[], slots: Rect[]): GeneratedPart {
  return {
    id: 'top',
    kind: 'top',
    name: KIND_LABEL.top,
    thickness: c.top.thickness,
    geometry: {
      outer: rectPolygon(0, 0, c.top.length, c.top.width),
      holes,
      cutouts: slots.map(rectToPolygon),
    },
    placement: { label: 'Tampo', origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  }
}

function finish(config: ProjectConfig, parts: GeneratedPart[], issues: Issues): GeneratedProject {
  const bom = buildBom(parts)
  const top = parts.find((p) => p.kind === 'top')
  return {
    config,
    parts,
    bom,
    stats: {
      topHoleCount: top?.geometry.holes.length ?? 0,
      totalComponents: parts.length,
      uniqueParts: bom.length,
      sideCount: parts.filter((p) => p.kind === 'sideLong' || p.kind === 'sideShort').length,
      ribCount: parts.filter((p) => p.kind === 'ribLongitudinal' || p.kind === 'ribTransverse').length,
    },
    issues: issues.list,
    canExport: !issues.hasErrors && parts.length > 0,
  }
}
