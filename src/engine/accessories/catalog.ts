// Acessórios paramétricos. As regras e os valores-padrão vêm do projeto
// "Mesa de Solda" no Fusion 360 (ver docs/acessorios-fusion.md). Medidas que
// dependem da malha são múltiplos do passo; o resto é em mm.
import { EPS, filletedPolygon, slotPolygon } from '../geom'
import type { Circle, Polygon, Severity, ValidationIssue } from '../types'
import { validatePartGeometry } from '../validateGeometry'
import type { AccessoryBuild, AccessoryDefinition, AccessoryPart, HolePattern, ParamSpec, ParamValue } from './types'

type P = Record<string, ParamValue>

const num = (p: P, k: string) => Number(p[k])
const fmt = (v: number) => `${Number(v.toFixed(2)).toLocaleString('pt-BR')} mm`
/** bulge de um arco de 270° no sentido horário (alívio de canto). */
const RELIEF_BULGE = -Math.tan((3 * Math.PI) / 2 / 4)

class Report {
  issues: ValidationIssue[] = []
  add(severity: Severity, message: string) {
    this.issues.push({ severity, code: 'accessory', message })
  }
  error(m: string) {
    this.add('error', m)
  }
  get failed() {
    return this.issues.some((i) => i.severity === 'error')
  }
}

// ---------------------------------------------------------------------------
// Parâmetros comuns

const AXIS_PARAM: ParamSpec = {
  key: 'axis',
  label: 'Comprimento acompanha o passo',
  kind: 'select',
  options: [
    { value: 'x', label: 'em X' },
    { value: 'y', label: 'em Y' },
  ],
  help: 'Em malhas com passos diferentes em X e Y, escolha em qual direção o acessório será usado.',
}

const COMMON_PARAMS: ParamSpec[] = [
  { key: 'thickness', label: 'Espessura da chapa', kind: 'mm', min: 1, max: 50 },
  {
    key: 'holeClearance',
    label: 'Folga dos furos e rasgos',
    kind: 'mm',
    min: 0,
    max: 3,
    help: 'Quanto o furo do acessório fica maior que o furo da mesa. No modelo original é zero (Ø15,8 nos dois).',
    group: 'avancado',
  },
  { key: 'minWeb', label: 'Material mínimo entre recortes', kind: 'mm', min: 0, max: 30, group: 'avancado' },
]

function checkRanges(specs: ParamSpec[], p: P, r: Report) {
  for (const s of specs) {
    const v = p[s.key]
    if (s.kind === 'mm' || s.kind === 'count') {
      const n = Number(v)
      if (typeof v !== 'number' || !Number.isFinite(n)) r.error(`${s.label}: informe um número.`)
      else if (s.kind === 'count' && !Number.isInteger(n)) r.error(`${s.label} deve ser um número inteiro.`)
      else if (s.min !== undefined && n < s.min) r.error(`${s.label} deve ser no mínimo ${s.min}${s.kind === 'mm' ? ' mm' : ''}.`)
      else if (s.max !== undefined && n > s.max) r.error(`${s.label} deve ser no máximo ${s.max}${s.kind === 'mm' ? ' mm' : ''}.`)
    } else if (s.kind === 'select' && !s.options!.some((o) => o.value === v)) {
      r.error(`${s.label}: opção inválida.`)
    } else if (s.kind === 'boolean' && typeof v !== 'boolean') {
      r.error(`${s.label}: valor inválido.`)
    }
  }
}

function checkPattern(pattern: HolePattern, r: Report) {
  const ok = (v: number) => Number.isFinite(v) && v > 0
  if (!ok(pattern.diameter) || !ok(pattern.pitchX) || !ok(pattern.pitchY)) {
    r.error('O padrão de furação precisa de diâmetro e espaçamentos maiores que zero.')
  } else if (pattern.diameter >= Math.min(pattern.pitchX, pattern.pitchY)) {
    r.error('O diâmetro dos furos é maior ou igual ao espaçamento do padrão de furação.')
  }
}

/** Confere a geometria final de cada peça, inclusive o material mínimo. */
function finish(parts: AccessoryPart[], r: Report, minWeb: number, dims: AccessoryBuild['dimensions'], assembly?: string[]): AccessoryBuild {
  for (const part of parts) {
    const problems = validatePartGeometry(part.geometry, { minWeb })
    if (problems.length) r.error(`${part.name}: ${problems.join('; ')}.`)
  }
  return { parts: r.failed ? [] : parts, issues: r.issues, dimensions: dims, assembly }
}

/** Rasgo que cobre do passo k1 ao k2 a partir de um furo, com folgas antes e depois. */
function slotRange(pitch: number, k1: number, k2: number, before: number, after: number) {
  return { dMin: k1 * pitch - before, dMax: k2 * pitch + after }
}

function rect(x0: number, y0: number, x1: number, y1: number, rCorner: number) {
  return filletedPolygon([
    { x: x0, y: y0, r: rCorner },
    { x: x1, y: y0, r: rCorner },
    { x: x1, y: y1, r: rCorner },
    { x: x0, y: y1, r: rCorner },
  ])
}

function slotOrHole(x0: number, y0: number, x1: number, y1: number, r: number): { holes: Circle[]; cutouts: Polygon[] } {
  if (Math.hypot(x1 - x0, y1 - y0) < EPS) return { holes: [{ x: x0, y: y0, r }], cutouts: [] }
  return { holes: [], cutouts: [slotPolygon(x0, y0, x1, y1, r)] }
}

// ---------------------------------------------------------------------------
// Barras de fixação (reta e com recorte em V)

const BAR_PARAMS: ParamSpec[] = [
  AXIS_PARAM,
  { key: 'pitches', label: 'Comprimento (em passos da malha)', kind: 'count', min: 2, max: 20, help: 'O comprimento é sempre um múltiplo do passo, para a barra coincidir com a malha.' },
  { key: 'width', label: 'Largura', kind: 'mm', min: 10, max: 300 },
  { key: 'holeEnd', label: 'Distância do furo à extremidade', kind: 'mm', min: 0, max: 200 },
  { key: 'slotFrom', label: 'Rasgo começa no passo', kind: 'count', min: 1, max: 19, help: 'Contado a partir do furo. 1 = primeiro furo vizinho da malha.' },
  { key: 'slotTo', label: 'Rasgo termina no passo', kind: 'count', min: 1, max: 19 },
  { key: 'slotBefore', label: 'Curso extra do rasgo (lado do furo)', kind: 'mm', min: 0, max: 200, group: 'avancado' },
  { key: 'slotAfter', label: 'Curso extra do rasgo (lado oposto)', kind: 'mm', min: 0, max: 200, group: 'avancado' },
  { key: 'cornerRadius', label: 'Raio dos cantos', kind: 'mm', min: 0, max: 20, group: 'avancado' },
]

function barCommon(pattern: HolePattern, p: P, r: Report) {
  const pitch = p.axis === 'y' ? pattern.pitchY : pattern.pitchX
  const L = num(p, 'pitches') * pitch
  const W = num(p, 'width')
  const rad = (pattern.diameter + num(p, 'holeClearance')) / 2
  const holeX = L - num(p, 'holeEnd')
  const k1 = num(p, 'slotFrom')
  const k2 = num(p, 'slotTo')
  if (k2 < k1) r.error('O passo final do rasgo deve ser maior ou igual ao inicial.')
  if (num(p, 'pitches') <= k2) r.error(`A barra de ${num(p, 'pitches')} passos é curta demais para um rasgo até o passo ${k2}.`)
  if (W / 2 - rad < num(p, 'minWeb')) r.error(`A largura (${fmt(W)}) não deixa material suficiente ao redor dos furos de ${fmt(2 * rad)}.`)
  const { dMin, dMax } = slotRange(pitch, k1, k2, num(p, 'slotBefore'), num(p, 'slotAfter'))
  return { pitch, L, W, rad, holeX, dMin, dMax }
}

function buildBar(pattern: HolePattern, p: P): AccessoryBuild {
  const r = new Report()
  checkPattern(pattern, r)
  checkRanges([...COMMON_PARAMS, ...BAR_PARAMS], p, r)
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }
  const { L, W, rad, holeX, dMin, dMax } = barCommon(pattern, p, r)
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }
  const slot = slotOrHole(holeX - dMax, W / 2, holeX - dMin, W / 2, rad)
  const part: AccessoryPart = {
    id: 'barra',
    name: 'Barra',
    thickness: num(p, 'thickness'),
    geometry: {
      outer: rect(0, 0, L, W, num(p, 'cornerRadius')),
      holes: [{ x: holeX, y: W / 2, r: rad }, ...slot.holes],
      cutouts: slot.cutouts,
    },
  }
  return finish([part], r, num(p, 'minWeb'), [
    { label: 'Comprimento', value: L },
    { label: 'Largura', value: W },
    { label: 'Espessura', value: num(p, 'thickness') },
  ])
}

function buildVBar(pattern: HolePattern, p: P): AccessoryBuild {
  const r = new Report()
  checkPattern(pattern, r)
  checkRanges([...COMMON_PARAMS, ...BAR_PARAMS, ...VBAR_EXTRA], p, r)
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }
  const { L, W, rad, holeX, dMin, dMax } = barCommon(pattern, p, r)
  const rr = num(p, 'reliefRadius')
  const rc = num(p, 'cornerRadius')
  if (rr >= W / 2) r.error('O alívio do V precisa ser menor que metade da largura da barra.')
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }
  // V de 90°: flancos a 45° dos cantos da extremidade até o vértice, a W/2 da ponta.
  const ax = W / 2
  const ay = W / 2
  const k = rr / Math.SQRT2
  const outer = filletedPolygon([
    { x: 0, y: 0, r: rc },
    { x: L, y: 0, r: rc },
    { x: L, y: W, r: rc },
    { x: 0, y: W, r: rc },
    { x: ax - k, y: ay + k, bulge: RELIEF_BULGE }, // alívio circular no vértice
    { x: ax - k, y: ay - k },
  ])
  const slot = slotOrHole(holeX - dMax, W / 2, holeX - dMin, W / 2, rad)
  const part: AccessoryPart = {
    id: 'barra-v',
    name: 'Barra com V',
    thickness: num(p, 'thickness'),
    geometry: { outer, holes: [{ x: holeX, y: W / 2, r: rad }, ...slot.holes], cutouts: slot.cutouts },
  }
  return finish([part], r, num(p, 'minWeb'), [
    { label: 'Comprimento', value: L },
    { label: 'Largura', value: W },
    { label: 'Profundidade do V', value: ax },
    { label: 'Espessura', value: num(p, 'thickness') },
  ])
}

const VBAR_EXTRA: ParamSpec[] = [
  { key: 'reliefRadius', label: 'Raio do alívio no vértice do V', kind: 'mm', min: 0.5, max: 50, group: 'avancado', help: 'Furo de alívio no fundo do V, para peças com canto vivo ou tubos encostarem por inteiro.' },
]

// ---------------------------------------------------------------------------
// Cantoneira plana em L

const L_PARAMS: ParamSpec[] = [
  { key: 'pitchesX', label: 'Braço horizontal (em passos X)', kind: 'count', min: 2, max: 20 },
  { key: 'pitchesY', label: 'Braço vertical (em passos Y)', kind: 'count', min: 2, max: 20 },
  { key: 'armWidth', label: 'Largura dos braços', kind: 'mm', min: 10, max: 300 },
  { key: 'slotExtra', label: 'Curso extra dos rasgos', kind: 'mm', min: 0, max: 100, group: 'avancado' },
  { key: 'reliefRadius', label: 'Raio do alívio do canto interno', kind: 'mm', min: 0.5, max: 50, group: 'avancado', help: 'Alívio no canto interno do L para a peça encostar nos dois lados.' },
  { key: 'cornerRadius', label: 'Raio dos cantos', kind: 'mm', min: 0, max: 20, group: 'avancado' },
]

function buildL(pattern: HolePattern, p: P): AccessoryBuild {
  const r = new Report()
  checkPattern(pattern, r)
  checkRanges([...COMMON_PARAMS, ...L_PARAMS], p, r)
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }
  const nx = num(p, 'pitchesX')
  const ny = num(p, 'pitchesY')
  const Lx = nx * pattern.pitchX
  const Ly = ny * pattern.pitchY
  const W = num(p, 'armWidth')
  const rad = (pattern.diameter + num(p, 'holeClearance')) / 2
  const rr = num(p, 'reliefRadius')
  const rc = num(p, 'cornerRadius')
  const extra = num(p, 'slotExtra')
  if (W >= Math.min(Lx, Ly)) r.error('A largura dos braços precisa ser menor que o comprimento dos braços.')
  if (W / 2 - rad < num(p, 'minWeb')) r.error(`A largura dos braços (${fmt(W)}) não deixa material suficiente ao redor dos furos de ${fmt(2 * rad)}.`)
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }

  const cx = Lx - W
  const cy = W
  const outer = filletedPolygon([
    { x: 0, y: 0, r: rc },
    { x: Lx, y: 0, r: rc },
    { x: Lx, y: Ly, r: rc },
    { x: cx, y: Ly, r: rc },
    { x: cx, y: cy + rr, bulge: RELIEF_BULGE }, // alívio de 270° centrado no canto interno
    { x: cx - rr, y: cy },
    { x: 0, y: cy, r: rc },
  ])
  // furo no cruzamento dos eixos dos braços; rasgos do 1º ao penúltimo passo
  const hx = Lx - W / 2
  const hy = W / 2
  const sx = slotRange(pattern.pitchX, 1, nx - 1, extra, extra)
  const sy = slotRange(pattern.pitchY, 1, ny - 1, extra, extra)
  const a = slotOrHole(hx - sx.dMax, hy, hx - sx.dMin, hy, rad)
  const b = slotOrHole(hx, hy + sy.dMin, hx, hy + sy.dMax, rad)
  const part: AccessoryPart = {
    id: 'cantoneira',
    name: 'Cantoneira',
    thickness: num(p, 'thickness'),
    geometry: { outer, holes: [{ x: hx, y: hy, r: rad }, ...a.holes, ...b.holes], cutouts: [...a.cutouts, ...b.cutouts] },
  }
  return finish([part], r, num(p, 'minWeb'), [
    { label: 'Braço horizontal', value: Lx },
    { label: 'Braço vertical', value: Ly },
    { label: 'Largura dos braços', value: W },
    { label: 'Espessura', value: num(p, 'thickness') },
  ])
}

// ---------------------------------------------------------------------------
// Esquadro de fixação 90° com reforços

const SQUARE_PARAMS: ParamSpec[] = [
  AXIS_PARAM,
  { key: 'columns', label: 'Largura da face (em passos)', kind: 'count', min: 1, max: 10, help: '1 passo gera a versão estreita, com rasgos na face; 2 ou mais geram a face com malha de furos.' },
  { key: 'rows', label: 'Altura da face (em passos)', kind: 'count', min: 2, max: 20 },
  { key: 'baseSlotPitches', label: 'Curso dos rasgos da base (em passos)', kind: 'count', min: 1, max: 10, help: 'Os rasgos da base permitem deslizar o esquadro sobre a mesa antes de apertar.' },
  { key: 'tabWidth', label: 'Largura das abas', kind: 'mm', min: 5, max: 100, group: 'avancado' },
  { key: 'depthClearance', label: 'Folga de profundidade dos encaixes', kind: 'mm', min: 0, max: 3, group: 'avancado', help: 'Folga lateral entre a base/reforços e a face. No modelo original: 0,2 mm.' },
  { key: 'widthClearance', label: 'Folga na largura dos encaixes', kind: 'mm', min: 0, max: 3, group: 'avancado', help: 'Quanto o entalhe é mais largo que a aba. No modelo original: 0.' },
  { key: 'slotStart', label: 'Início dos rasgos da base (atrás da face)', kind: 'mm', min: 5, max: 200, group: 'avancado' },
  { key: 'backMargin', label: 'Margem traseira da base', kind: 'mm', min: 5, max: 200, group: 'avancado' },
  { key: 'chamfer', label: 'Chanfro das pontas do reforço', kind: 'mm', min: 5, max: 200, group: 'avancado' },
  { key: 'reliefInset', label: 'Largura da moldura do reforço', kind: 'mm', min: 10, max: 200, group: 'avancado', help: 'Distância das bordas do reforço até o recorte de alívio triangular.' },
  { key: 'holeInset', label: 'Distância dos furos às bordas do reforço', kind: 'mm', min: 5, max: 100, group: 'avancado' },
  { key: 'cornerRadius', label: 'Raio dos cantos do reforço', kind: 'mm', min: 0, max: 20, group: 'avancado' },
]

/** Contorno de chapa com entalhes retangulares, montado no sentido anti-horário. */
function polyFromPath(path: [number, number][]): Polygon {
  const out: Polygon = []
  for (const [x, y] of path) {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.x - x) > EPS || Math.abs(last.y - y) > EPS) out.push({ x, y })
  }
  return out
}

function buildSquare(pattern: HolePattern, p: P): AccessoryBuild {
  const r = new Report()
  checkPattern(pattern, r)
  checkRanges([...COMMON_PARAMS, ...SQUARE_PARAMS], p, r)
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }

  const pitch = p.axis === 'y' ? pattern.pitchY : pattern.pitchX
  const t = num(p, 'thickness')
  const nc = num(p, 'columns')
  const nr = num(p, 'rows')
  const W = nc * pitch
  const H = nr * pitch
  const ns = num(p, 'baseSlotPitches')
  const tw = num(p, 'tabWidth')
  const cDepth = num(p, 'depthClearance')
  const cWidth = num(p, 'widthClearance')
  const D = t + num(p, 'slotStart') + ns * pitch + num(p, 'backMargin')
  const ch = num(p, 'chamfer')
  const rad = (pattern.diameter + num(p, 'holeClearance')) / 2
  const minWeb = num(p, 'minWeb')
  const rc = num(p, 'cornerRadius')
  const nw = tw + cWidth // largura dos entalhes

  // posições das abas (proporcionais, ver docs/acessorios-fusion.md)
  const hc = [0.23771 * H, 0.75 * H] // abas do reforço na face, medidas da base
  const bc = [0.19974 * D, 0.77593 * D] // abas da base nos reforços, medidas da frente da face
  if (hc[0] - nw / 2 < t + minWeb) r.error('A face é baixa demais para os encaixes dos reforços acima da base.')
  if (hc[1] - hc[0] < nw + minWeb) r.error('Os encaixes dos reforços na face ficariam sobrepostos.')
  if (bc[0] - nw / 2 < t + minWeb || bc[1] + nw / 2 > D - minWeb) r.error('A base é curta demais para os encaixes dos reforços.')
  if (W - 2 * (t + cDepth) < nw + minWeb) r.error('A face é estreita demais para a aba da base entre os reforços.')
  if (ch >= H - t || ch >= D - t) r.error('O chanfro do reforço é maior que as pernas do triângulo.')
  if (nc === 1 && (nr < 4 || nr % 2 !== 0)) r.error('A versão estreita (1 passo) precisa de altura par, com pelo menos 4 passos.')
  if (r.failed) return { parts: [], issues: r.issues, dimensions: [] }

  // --- Face vertical: x na largura, y na altura (y = 0 apoiado na mesa)
  const sd = t + cDepth
  const faceOutline = polyFromPath([
    [0, 0],
    [W / 2 - nw / 2, 0],
    [W / 2 - nw / 2, t],
    [W / 2 + nw / 2, t],
    [W / 2 + nw / 2, 0],
    [W, 0],
    ...hc.flatMap((h): [number, number][] => [
      [W, h - nw / 2],
      [W - sd, h - nw / 2],
      [W - sd, h + nw / 2],
      [W, h + nw / 2],
    ]),
    [W, H],
    [0, H],
    ...[...hc].reverse().flatMap((h): [number, number][] => [
      [0, h + nw / 2],
      [sd, h + nw / 2],
      [sd, h - nw / 2],
      [0, h - nw / 2],
    ]),
  ])
  const faceHoles: Circle[] = []
  const faceCutouts: Polygon[] = []
  if (nc >= 2) {
    for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++) faceHoles.push({ x: pitch / 2 + i * pitch, y: pitch / 2 + j * pitch, r: rad })
  } else {
    // versão estreita: rasgo na metade inferior, furo no meio, rasgo na metade superior
    const half = nr / 2
    faceCutouts.push(slotPolygon(W / 2, pitch / 2, W / 2, pitch / 2 + (half - 1) * pitch, rad))
    faceHoles.push({ x: W / 2, y: H / 2, r: rad })
    faceCutouts.push(slotPolygon(W / 2, H / 2 + pitch / 2, W / 2, H - pitch / 2, rad))
  }

  // --- Base: x na largura (entre as faces externas dos reforços), y da frente da face para trás
  const Wb = W - 2 * cDepth
  const baseOutline = polyFromPath([
    [t, t],
    [Wb / 2 - tw / 2, t],
    [Wb / 2 - tw / 2, 0],
    [Wb / 2 + tw / 2, 0],
    [Wb / 2 + tw / 2, t],
    [Wb - t, t],
    ...bc.flatMap((y): [number, number][] => [
      [Wb - t, y - tw / 2],
      [Wb, y - tw / 2],
      [Wb, y + tw / 2],
      [Wb - t, y + tw / 2],
    ]),
    [Wb - t, D],
    [t, D],
    ...[...bc].reverse().flatMap((y): [number, number][] => [
      [t, y + tw / 2],
      [0, y + tw / 2],
      [0, y - tw / 2],
      [t, y - tw / 2],
    ]),
  ])
  const y0 = t + num(p, 'slotStart')
  const baseCutouts: Polygon[] = []
  for (let i = 0; i < nc; i++) {
    const x = pitch / 2 + i * pitch - cDepth // alinhado às colunas de furos da face
    baseCutouts.push(slotPolygon(x, y0, x, y0 + ns * pitch, rad))
  }

  // --- Reforço triangular: s da frente da face para trás, h a partir da mesa
  const top = { x: t + ch, y: H }
  const back = { x: D, y: ch }
  const gussetOutline = filletedPolygon([
    { x: t, y: 0 },
    ...bc.flatMap((s) => [
      { x: s - nw / 2, y: 0 },
      { x: s - nw / 2, y: t },
      { x: s + nw / 2, y: t },
      { x: s + nw / 2, y: 0 },
    ]),
    { x: D, y: 0 },
    { x: back.x, y: back.y, r: rc },
    { x: top.x, y: top.y, r: rc },
    { x: t, y: H },
    ...[...hc].reverse().flatMap((h) => [
      { x: t, y: h + tw / 2 },
      { x: 0, y: h + tw / 2 },
      { x: 0, y: h - tw / 2 },
      { x: t, y: h - tw / 2 },
    ]),
  ])
  // hipotenusa e normal apontando para dentro do triângulo
  const hl = Math.hypot(top.x - back.x, top.y - back.y)
  const dir = { x: (top.x - back.x) / hl, y: (top.y - back.y) / hl }
  const nIn = { x: -dir.y, y: dir.x }
  const insetHyp = (off: number) => ({ px: back.x + nIn.x * off, py: back.y + nIn.y * off })
  const lineAt = (off: number, axis: 'x' | 'y', value: number) => {
    // ponto da hipotenusa deslocada em que x (ou y) = value
    const { px, py } = insetHyp(off)
    const tt = axis === 'x' ? (value - px) / dir.x : (value - py) / dir.y
    return { x: px + dir.x * tt, y: py + dir.y * tt }
  }
  const off = num(p, 'reliefInset')
  const v1 = { x: t + off, y: off }
  const v2 = lineAt(off, 'y', off)
  const v3 = lineAt(off, 'x', t + off)
  const gussetCutouts: Polygon[] = []
  if (v2.x - v1.x > 2 * rc + minWeb && v3.y - v1.y > 2 * rc + minWeb) {
    gussetCutouts.push(filletedPolygon([
      { ...v1, r: rc },
      { ...v2, r: rc },
      { ...v3, r: rc },
    ]))
  } else {
    r.add('warning', 'O reforço é pequeno demais para o recorte de alívio; ele foi omitido.')
  }
  const hi = num(p, 'holeInset')
  const midHyp = { x: (top.x + back.x) / 2 + nIn.x * hi, y: (top.y + back.y) / 2 + nIn.y * hi }
  const gussetHoles: Circle[] = [
    { x: t + hi, y: hi, r: rad },
    { x: D - hi, y: hi, r: rad },
    { x: t + hi, y: H - ch, r: rad },
    { x: t + hi, y: (hi + H - ch) / 2, r: rad },
    { x: midHyp.x, y: midHyp.y, r: rad },
  ]

  const parts: AccessoryPart[] = [
    { id: 'face', name: 'Face vertical', thickness: t, geometry: { outer: faceOutline, holes: faceHoles, cutouts: faceCutouts } },
    { id: 'base', name: 'Base', thickness: t, geometry: { outer: baseOutline, holes: [], cutouts: baseCutouts } },
    { id: 'reforco-1', name: 'Reforço triangular', thickness: t, geometry: { outer: gussetOutline, holes: gussetHoles, cutouts: gussetCutouts } },
    { id: 'reforco-2', name: 'Reforço triangular', thickness: t, geometry: { outer: gussetOutline, holes: gussetHoles, cutouts: gussetCutouts } },
  ]
  return finish(parts, r, minWeb, [
    { label: 'Largura', value: W },
    { label: 'Profundidade', value: D },
    { label: 'Altura', value: H },
    { label: 'Espessura das chapas', value: t },
  ], [
    `A base apoia na mesa atrás da face; sua aba frontal (${fmt(tw)}) entra no entalhe inferior da face.`,
    `Os dois reforços ficam nas laterais, rentes às bordas da face. Suas abas atravessam os entalhes laterais da face (profundidade ${fmt(sd)}).`,
    'As abas laterais da base atravessam os entalhes inferiores dos reforços.',
    `Os rasgos da base ficam alinhados às colunas de furos da face e permitem ${ns} passo(s) de curso.`,
  ])
}

// ---------------------------------------------------------------------------

const baseDefaults = { thickness: 9.53, holeClearance: 0, minWeb: 3 }

export const ACCESSORIES: AccessoryDefinition[] = [
  {
    id: 'esquadro-90',
    name: 'Esquadro de fixação 90°',
    category: 'Esquadros',
    description: 'Esquadro vertical montado com face, base e dois reforços triangulares encaixados.',
    fusionSource: 'Esquadro Vertical / Esquadro Vertical (1)',
    params: [...SQUARE_PARAMS.slice(0, 4), ...COMMON_PARAMS, ...SQUARE_PARAMS.slice(4)],
    defaults: {
      ...baseDefaults,
      thickness: 6.35,
      axis: 'x',
      columns: 2,
      rows: 4,
      baseSlotPitches: 2,
      tabWidth: 20,
      depthClearance: 0.2,
      widthClearance: 0,
      slotStart: 25,
      backMargin: 24.85,
      chamfer: 30,
      reliefInset: 35,
      holeInset: 17.5,
      cornerRadius: 3,
    },
    build: buildSquare,
  },
  {
    id: 'cantoneira-l',
    name: 'Cantoneira plana em L',
    category: 'Esquadros',
    description: 'Chapa em L com furo no canto e rasgos nos dois braços para alinhar peças a 90°.',
    fusionSource: 'Esquadro 2D',
    params: [...L_PARAMS.slice(0, 3), ...COMMON_PARAMS, ...L_PARAMS.slice(3)],
    defaults: { ...baseDefaults, pitchesX: 4, pitchesY: 4, armWidth: 50, slotExtra: 5, reliefRadius: 7.5, cornerRadius: 1 },
    build: buildL,
  },
  {
    id: 'barra-reta',
    name: 'Barra de fixação reta',
    category: 'Barras',
    description: 'Barra com um furo e um rasgo oblongo para ajustar a posição de batentes e fixadores.',
    fusionSource: 'Trava',
    params: [...BAR_PARAMS.slice(0, 6), ...COMMON_PARAMS, ...BAR_PARAMS.slice(6)],
    defaults: { ...baseDefaults, axis: 'x', pitches: 3, width: 50, holeEnd: 20, slotFrom: 1, slotTo: 2, slotBefore: 20, slotAfter: 0, cornerRadius: 1 },
    build: buildBar,
  },
  {
    id: 'barra-v',
    name: 'Barra de fixação com recorte em V',
    category: 'Barras',
    description: 'Barra com V de 90° em uma extremidade para posicionar tubos e barras redondas.',
    fusionSource: 'Trava em V',
    params: [...BAR_PARAMS.slice(0, 6), ...COMMON_PARAMS, ...BAR_PARAMS.slice(6), ...VBAR_EXTRA],
    defaults: { ...baseDefaults, axis: 'x', pitches: 3, width: 50, holeEnd: 20, slotFrom: 1, slotTo: 1, slotBefore: 25, slotAfter: 35, cornerRadius: 1, reliefRadius: 5 },
    build: buildVBar,
  },
]

export function accessoryById(id: string): AccessoryDefinition | undefined {
  return ACCESSORIES.find((a) => a.id === id)
}
