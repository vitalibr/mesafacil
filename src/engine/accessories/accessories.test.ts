import DxfParser from 'dxf-parser'
import { describe, expect, it } from 'vitest'
import { partToDxf } from '../../export/dxf'
import { createDefaultConfig } from '../defaults'
import { exactBounds, netArea } from '../geom'
import { parseProject, serializeProject } from '../serialize'
import type { ProjectConfig } from '../types'
import { validatePartGeometry } from '../validateGeometry'
import { ACCESSORIES, accessoryById, createAccessoryInstance, resolveAccessory } from './index'
import type { AccessoryBuild, HolePattern, ParamValue } from './types'

const FUSION: HolePattern = { diameter: 15.8, pitchX: 50, pitchY: 50 }
const A: HolePattern = { diameter: 16, pitchX: 50, pitchY: 50 }
const B: HolePattern = { diameter: 20, pitchX: 100, pitchY: 100 }
const C: HolePattern = { diameter: 16, pitchX: 50, pitchY: 100 }

function build(id: string, pattern: HolePattern, params: Record<string, ParamValue> = {}): AccessoryBuild {
  const def = accessoryById(id)!
  return def.build(pattern, { ...def.defaults, ...params })
}

const errors = (b: AccessoryBuild) => b.issues.filter((i) => i.severity === 'error')
const size = (b: AccessoryBuild, i = 0) => {
  const r = exactBounds(b.parts[i].geometry.outer)
  return [r.x1 - r.x0, r.y1 - r.y0]
}
/** Posições dos furos e centros dos rasgos ao longo de um eixo. */
const slotCenters = (b: AccessoryBuild, i = 0) =>
  b.parts[i].geometry.cutouts.map((c) => {
    const r = exactBounds(c)
    return { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, w: Math.min(r.x1 - r.x0, r.y1 - r.y0) }
  })

describe('comparação com o modelo original do Fusion 360 (Ø15,8, passo 50)', () => {
  // áreas líquidas = volume do corpo no Fusion / espessura
  it('barra reta: 150 × 50, área igual à do Fusion', () => {
    const b = build('barra-reta', FUSION)
    expect(errors(b)).toEqual([])
    const [w, h] = size(b)
    expect(w).toBeCloseTo(150, 6)
    expect(h).toBeCloseTo(50, 6)
    expect(netArea(b.parts[0].geometry)).toBeCloseTo(57189.6 / 9.53, 0)
    expect(b.parts[0].geometry.holes[0].x).toBeCloseTo(130)
    const s = slotCenters(b)[0]
    expect(s.x0 + 7.9).toBeCloseTo(30) // espelho do Fusion: rasgo de 50 a 120 visto da outra ponta
    expect(s.x1 - 7.9).toBeCloseTo(100)
  })

  it('barra com V: área igual à do Fusion (alívio de 270° no vértice)', () => {
    const b = build('barra-v', FUSION)
    expect(errors(b)).toEqual([])
    expect(netArea(b.parts[0].geometry)).toBeCloseTo(52158.3 / 9.53, 0)
    const [w] = size(b)
    // 150 menos o recuo do arco r1 no canto de 45° da boca do V (1,414)
    expect(w).toBeCloseTo(150 - Math.SQRT2, 6)
  })

  it('cantoneira em L: 200 × 200, área igual à do Fusion', () => {
    const b = build('cantoneira-l', FUSION)
    expect(errors(b)).toEqual([])
    expect(size(b)).toEqual([200, 200])
    // pequena diferença: no Fusion o rasgo está inclinado 0,14° (ver docs)
    expect(netArea(b.parts[0].geometry)).toBeCloseTo(126769.9 / 9.53, -1)
  })

  it('esquadro 90°: face, base e reforços com as medidas do Fusion', () => {
    const b = build('esquadro-90', FUSION)
    expect(errors(b)).toEqual([])
    expect(b.parts.map((p) => p.name)).toEqual(['Face vertical', 'Base', 'Reforço triangular', 'Reforço triangular'])
    expect(size(b, 0)).toEqual([100, 200])
    const [bw, bd] = size(b, 1)
    expect(bw).toBeCloseTo(99.6, 6)
    expect(bd).toBeCloseTo(156.2, 6)
    const [gs, gh] = size(b, 2)
    expect(gs).toBeCloseTo(156.2, 6)
    expect(gh).toBeCloseTo(200, 6)
    expect(netArea(b.parts[0].geometry)).toBeCloseTo(112906.0 / 6.35, 0)
    expect(netArea(b.parts[1].geometry)).toBeCloseTo(64165.7 / 6.35, 0)
    // reforço: corpo começa 0,15 mm mais atrás que no Fusion (correção de sobreposição, ver docs)
    expect(Math.abs(netArea(b.parts[2].geometry) - 98446.8 / 6.35)).toBeLessThan(40)
    expect(b.parts[0].geometry.holes).toHaveLength(8)
  })

  it('versão estreita (1 passo) reproduz o Esquadro Vertical (1)', () => {
    const b = build('esquadro-90', FUSION, { columns: 1 })
    expect(errors(b)).toEqual([])
    expect(size(b, 0)).toEqual([50, 200])
    expect(b.parts[0].geometry.holes).toHaveLength(1)
    expect(b.parts[0].geometry.cutouts).toHaveLength(2)
    expect(size(b, 1)[0]).toBeCloseTo(49.6, 6)
  })
})

describe('adaptação aos padrões de furação A, B e C', () => {
  for (const [name, pat] of Object.entries({ A, B, C })) {
    it(`padrão ${name}: todos os acessórios são válidos e compatíveis com a malha`, () => {
      for (const def of ACCESSORIES) {
        const b = def.build(pat, def.defaults)
        expect(errors(b), `${def.id} ${name}`).toEqual([])
        for (const p of b.parts) {
          expect(validatePartGeometry(p.geometry, { minWeb: 3 }), `${def.id} ${p.name}`).toEqual([])
          for (const h of p.geometry.holes) expect(h.r * 2).toBeCloseTo(pat.diameter)
        }
      }
    })
  }

  it('barra: comprimento, furo e rasgo acompanham o passo', () => {
    for (const pat of [A, B]) {
      const b = build('barra-reta', pat)
      const p = pat.pitchX
      expect(size(b)[0]).toBeCloseTo(3 * p)
      const hole = b.parts[0].geometry.holes[0]
      const s = slotCenters(b)[0]
      const r = pat.diameter / 2
      // o rasgo cobre os pontos da malha a 1 e 2 passos do furo
      const near = hole.x - (s.x1 - r)
      const far = hole.x - (s.x0 + r)
      expect(near).toBeLessThanOrEqual(p + 1e-9)
      expect(far).toBeGreaterThanOrEqual(2 * p - 1e-9)
      expect(s.w).toBeCloseTo(pat.diameter)
    }
  })

  it('barra no eixo Y usa o passo Y em malha não quadrada (C)', () => {
    expect(size(build('barra-reta', C, { axis: 'x' }))[0]).toBeCloseTo(150)
    expect(size(build('barra-reta', C, { axis: 'y' }))[0]).toBeCloseTo(300)
  })

  it('cantoneira usa cada passo no seu braço (C)', () => {
    const b = build('cantoneira-l', C)
    expect(size(b)).toEqual([200, 400])
    const slots = slotCenters(b)
    const hole = b.parts[0].geometry.holes[0]
    const vertical = slots.find((s) => s.x1 - s.x0 < s.y1 - s.y0)!
    // rasgo vertical cobre de 1 a 3 passos Y a partir do furo do canto
    expect(vertical.y0 + 8 - hole.y).toBeLessThanOrEqual(100)
    expect(vertical.y1 - 8 - hole.y).toBeGreaterThanOrEqual(300)
  })

  it('esquadro: furos da face e rasgos da base seguem o passo', () => {
    const b = build('esquadro-90', B)
    expect(size(b, 0)).toEqual([200, 400])
    const xs = [...new Set(b.parts[0].geometry.holes.map((h) => h.x))].sort((a, z) => a - z)
    expect(xs).toEqual([50, 150])
    const baseSlots = slotCenters(b, 1).map((s) => (s.x0 + s.x1) / 2 + 0.2)
    expect(baseSlots.map((x) => Math.round(x * 1000) / 1000)).toEqual([50, 150])
  })

  it('encaixes do esquadro: abas e entalhes são compatíveis', () => {
    const b = build('esquadro-90', A, { widthClearance: 0.3 })
    const face = b.parts[0].geometry.outer
    const gusset = b.parts[2].geometry.outer
    // entalhes laterais da face: profundidade = espessura + 0,2 e altura = aba + folga
    const notchXs = face.filter((p) => Math.abs(p.x - 6.55) < 1e-9)
    expect(notchXs).toHaveLength(4)
    const ys = notchXs.map((p) => p.y).sort((a, z) => a - z)
    expect(ys[1] - ys[0]).toBeCloseTo(20.3)
    // abas do reforço: saem 6,35 (espessura da face) e têm 20 de altura
    const tabPts = gusset.filter((p) => Math.abs(p.x) < 1e-9).map((p) => p.y).sort((a, z) => a - z)
    expect(tabPts).toHaveLength(4)
    expect(tabPts[1] - tabPts[0]).toBeCloseTo(20)
    // aba cabe no entalhe correspondente
    expect(tabPts[0]).toBeGreaterThanOrEqual(ys[0] - 1e-9)
    expect(tabPts[1]).toBeLessThanOrEqual(ys[1] + 1e-9)
  })

  it('informa configurações impossíveis em vez de gerar peça incorreta', () => {
    expect(errors(build('barra-reta', A, { width: 18 }))).not.toEqual([])
    expect(errors(build('barra-reta', A, { slotFrom: 2, slotTo: 1 }))).not.toEqual([])
    expect(errors(build('barra-reta', A, { pitches: 2, slotTo: 2 }))).not.toEqual([])
    expect(errors(build('esquadro-90', A, { columns: 1, rows: 3 }))).not.toEqual([])
    expect(build('barra-reta', { diameter: 60, pitchX: 50, pitchY: 50 }).parts).toEqual([])
  })
})

describe('acessórios no projeto', () => {
  function withAccessories(): ProjectConfig {
    const c = createDefaultConfig()
    const sq = createAccessoryInstance('esquadro-90', c)
    sq.quantity = 4
    const bar = createAccessoryInstance('barra-reta', c)
    bar.quantity = 3
    c.accessories = [sq, bar]
    return c
  }

  it('herda o padrão da mesa e acompanha alterações', () => {
    const c = withAccessories()
    c.top.holes.pitchX = 100
    c.top.holes.diameter = 20
    const r = resolveAccessory(c.accessories[1], c)!
    expect(r.pattern).toEqual({ diameter: 20, pitchX: 100, pitchY: 50 })
    expect(r.bom[0].length).toBeCloseTo(300)
  })

  it('padrão personalizado diferente da mesa gera aviso', () => {
    const c = withAccessories()
    c.accessories[1].useTablePattern = false
    c.accessories[1].pattern = { diameter: 16, pitchX: 100, pitchY: 100 }
    const r = resolveAccessory(c.accessories[1], c)!
    expect(r.issues.some((i) => i.code === 'accessory-incompatible')).toBe(true)
    expect(r.canExport).toBe(true)
  })

  it('multiplica a quantidade de componentes pela quantidade de acessórios', () => {
    const c = withAccessories()
    const sq = resolveAccessory(c.accessories[0], c, 0)!
    expect(sq.bom.map((b) => [b.description, b.quantity])).toEqual([
      ['Esquadro de fixação 90° — Face vertical', 4],
      ['Esquadro de fixação 90° — Base', 4],
      ['Esquadro de fixação 90° — Reforço triangular', 8],
    ])
    expect(sq.bom.map((b) => b.fileName)).toEqual([
      'A1_Esquadro_de_fixacao_90_01_Face_vertical.dxf',
      'A1_Esquadro_de_fixacao_90_02_Base.dxf',
      'A1_Esquadro_de_fixacao_90_03_Reforco_triangular.dxf',
    ])
  })

  it('DXF dos acessórios tem arcos reais e contornos fechados', () => {
    const c = withAccessories()
    for (const r of [resolveAccessory(c.accessories[0], c)!, resolveAccessory(c.accessories[1], c)!]) {
      for (const item of r.bom) {
        const dxf = new DxfParser().parseSync(partToDxf(item.geometry)) as unknown as {
          header: Record<string, unknown>
          entities: { type: string; shape?: boolean; vertices: { bulge?: number }[] }[]
        }
        expect(dxf.header.$INSUNITS).toBe(4)
        const polys = dxf.entities.filter((e) => e.type === 'LWPOLYLINE')
        expect(polys).toHaveLength(1 + item.geometry.cutouts.length)
        expect(polys.every((p) => p.shape)).toBe(true)
        expect(dxf.entities.filter((e) => e.type === 'CIRCLE')).toHaveLength(item.holeCount)
        const bulges = polys.flatMap((p) => p.vertices.map((v) => v.bulge ?? 0)).filter((v) => v !== 0)
        const expected = [item.geometry.outer, ...item.geometry.cutouts].flat().filter((p) => p.bulge).length
        expect(bulges).toHaveLength(expected)
      }
    }
  })

  it('salva e carrega os parâmetros dos acessórios', () => {
    const c = withAccessories()
    c.accessories[0].params.columns = 3
    const r = parseProject(serializeProject(c))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.accessories).toEqual(c.accessories)
    const bad = JSON.parse(serializeProject(c))
    bad.accessories[0].typeId = 'inexistente'
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false)
    bad.accessories[0].typeId = 'esquadro-90'
    bad.accessories[0].params.columns = 'muitas'
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false)
  })
})
