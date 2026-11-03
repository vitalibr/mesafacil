import DxfParser from 'dxf-parser'
import JSZip from 'jszip'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../engine/defaults'
import { generateProject } from '../engine/generate'
import { polygonBounds } from '../engine/geom'
import { parseProject } from '../engine/serialize'
import type { BomItem, ProjectConfig } from '../engine/types'
import { bomToCsv, quoteRequestText, technicalSpecText } from './documents'
import { partToDxf } from './dxf'
import { createAccessoryInstance, resolveAccessories } from '../engine/accessories'
import { accessoryPackageFiles, buildProjectZip, projectPackageFiles } from './zip'

interface ParsedEntity {
  type: string
  layer: string
  shape?: boolean
  vertices?: { x: number; y: number }[]
  center?: { x: number; y: number }
  radius?: number
}

/** Lê o DXF com um leitor independente (dxf-parser) e confere a geometria contra a peça. */
function verifyDxf(item: BomItem) {
  const text = partToDxf(item.geometry)
  const dxf = new DxfParser().parseSync(text) as unknown as {
    header: Record<string, unknown>
    entities: ParsedEntity[]
    tables: { layer: { layers: Record<string, unknown> } }
  }
  expect(dxf.header.$INSUNITS).toBe(4) // milímetros
  expect(dxf.entities.every((e) => e.layer === 'CORTE')).toBe(true)
  expect(new Set(dxf.entities.map((e) => e.type))).toEqual(
    new Set(['LWPOLYLINE', ...(item.geometry.holes.length ? ['CIRCLE'] : [])]),
  )

  const circles = dxf.entities.filter((e) => e.type === 'CIRCLE')
  const polys = dxf.entities.filter((e) => e.type === 'LWPOLYLINE')
  expect(circles).toHaveLength(item.holeCount)
  expect(polys).toHaveLength(1 + item.geometry.cutouts.length)
  expect(polys.every((p) => p.shape === true)).toBe(true) // perfis fechados

  // sem entidades duplicadas
  const keys = dxf.entities.map((e) =>
    e.type === 'CIRCLE'
      ? `C${e.center!.x.toFixed(4)},${e.center!.y.toFixed(4)},${e.radius!.toFixed(4)}`
      : `P${e.vertices!.map((v) => `${v.x.toFixed(4)},${v.y.toFixed(4)}`).join(' ')}`,
  )
  expect(new Set(keys).size).toBe(keys.length)

  // contorno externo: a maior caixa envolvente precisa bater com a lista de peças
  const outer = polys[0].vertices!
  const b = polygonBounds(outer)
  expect(b.x0).toBeCloseTo(0, 6)
  expect(b.y0).toBeCloseTo(0, 6)
  expect(b.x1 - b.x0).toBeCloseTo(item.length, 6)
  expect(b.y1 - b.y0).toBeCloseTo(item.height, 6)
  outer.forEach((v, i) => {
    expect(v.x).toBeCloseTo(item.geometry.outer[i].x, 6)
    expect(v.y).toBeCloseTo(item.geometry.outer[i].y, 6)
  })
  circles.forEach((c, i) => {
    const h = item.geometry.holes[i]
    expect(c.center!.x).toBeCloseTo(h.x, 6)
    expect(c.center!.y).toBeCloseTo(h.y, 6)
    expect(c.radius).toBeCloseTo(h.r, 6)
  })
  return text
}

const scenarios: Record<string, (c: ProjectConfig) => void> = {
  somente_tampo: () => {},
  tampo_laterais: (c) => (c.sides.enabled = true),
  tampo_laterais_sem_encaixe: (c) => Object.assign(c.sides, { enabled: true, slotIntoTop: false }),
  tampo_reforcos: (c) => (c.ribs.enabled = true),
  tampo_reforcos_sem_encaixe: (c) => Object.assign(c.ribs, { enabled: true, slotIntoTop: false, interlock: false }),
  estrutura_completa: (c) => {
    c.sides.enabled = true
    c.sides.holes.enabled = true
    c.ribs.enabled = true
  },
}

describe('exportação DXF verificada por leitor independente', () => {
  for (const [name, mut] of Object.entries(scenarios)) {
    it(name, () => {
      const c = createDefaultConfig()
      mut(c)
      const p = generateProject(c)
      expect(p.canExport).toBe(true)
      const outDir = process.env.DXF_OUT
      for (const item of p.bom) {
        const text = verifyDxf(item)
        if (outDir) {
          mkdirSync(join(outDir, name), { recursive: true })
          writeFileSync(join(outDir, name, item.fileName), text)
        }
      }
    })
  }

  it('o tampo de referência tem 384 círculos de Ø16 e contorno 1200 × 800', () => {
    const p = generateProject(createDefaultConfig())
    const top = p.bom[0]
    const dxf = new DxfParser().parseSync(partToDxf(top.geometry)) as unknown as { entities: ParsedEntity[] }
    const circles = dxf.entities.filter((e) => e.type === 'CIRCLE')
    expect(circles).toHaveLength(384)
    expect(circles.every((c) => Math.abs(c.radius! - 8) < 1e-9)).toBe(true)
    const outer = dxf.entities.find((e) => e.type === 'LWPOLYLINE')!.vertices!
    expect(outer.map((v) => [v.x, v.y])).toEqual([[0, 0], [1200, 0], [1200, 800], [0, 800]])
  })

  it('rasgos no tampo aparecem como contornos fechados com as medidas do encaixe', () => {
    const c = createDefaultConfig()
    c.sides.enabled = true
    const p = generateProject(c)
    const dxf = new DxfParser().parseSync(partToDxf(p.bom[0].geometry)) as unknown as { entities: ParsedEntity[] }
    const slots = dxf.entities.filter((e) => e.type === 'LWPOLYLINE').slice(1)
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      const b = polygonBounds(s.vertices!)
      const dims = [b.x1 - b.x0, b.y1 - b.y0].sort((a, z) => a - z)
      expect(dims[0]).toBeCloseTo(6 + 0.5, 6) // espessura da lateral + folga
      expect(dims[1]).toBeCloseTo(40 + 0.5, 6) // largura da aba + folga
    }
  })
})

describe('pacote ZIP e documentos', () => {
  it('contém somente os arquivos das peças existentes', async () => {
    const c = createDefaultConfig()
    c.sides.enabled = true
    c.ribs.enabled = true
    const p = generateProject(c)
    const zip = await JSZip.loadAsync(await (await buildProjectZip(p)).arrayBuffer())
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()
    expect(names).toEqual([
      'MesaFacil_1200x800/DXF/01_Tampo.dxf',
      'MesaFacil_1200x800/DXF/02_Lateral_Longa.dxf',
      'MesaFacil_1200x800/DXF/03_Lateral_Curta.dxf',
      'MesaFacil_1200x800/DXF/04_Reforco_Longitudinal.dxf',
      'MesaFacil_1200x800/DXF/05_Reforco_Transversal.dxf',
      'MesaFacil_1200x800/Especificacoes_Tecnicas.txt',
      'MesaFacil_1200x800/Lista_de_Pecas.csv',
      'MesaFacil_1200x800/Pedido_de_Orcamento.txt',
      'MesaFacil_1200x800/Projeto/configuracao.json',
    ])
    const json = await zip.file('MesaFacil_1200x800/Projeto/configuracao.json')!.async('string')
    const back = parseProject(json)
    expect(back.ok && back.config).toEqual(c)

    const only = generateProject(createDefaultConfig())
    const files = projectPackageFiles(only).map((f) => f.path)
    expect(files.filter((f) => f.endsWith('.dxf'))).toEqual(['MesaFacil_1200x800/DXF/01_Tampo.dxf'])
  })

  it('não exporta projeto com erro', () => {
    const c = createDefaultConfig()
    c.top.holes.diameter = 60
    expect(() => projectPackageFiles(generateProject(c))).toThrow()
  })

  it('CSV no padrão brasileiro', () => {
    const c = createDefaultConfig()
    c.ribs.enabled = true
    c.ribs.slotIntoTop = false
    const csv = bomToCsv(generateProject(c))
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).trimEnd().split('\r\n')
    expect(lines[0].split(';')[0]).toBe('Código')
    expect(lines).toHaveLength(1 + 3)
    expect(lines[1]).toMatch(/^01;Tampo;1;1200;800;6;384;0,883;/)
  })

  it('pedido de orçamento usa quantidades e espessuras reais', () => {
    const c = createDefaultConfig()
    c.sides.enabled = true
    c.sides.thickness = 4
    c.quote.material = 'Aço carbono SAE 1020'
    const p = generateProject(c)
    const text = quoteRequestText(p)
    expect(text).toContain('Tampo: 1.200 × 800 mm')
    expect(text).toContain('Furos: Ø16 mm')
    expect(text).toContain('Material: Aço carbono SAE 1020')
    expect(text).toMatch(/02_Lateral_Longa\.dxf — 2 unidades — chapa 4 mm/)
    expect(text).not.toContain('Reforco')
    expect(technicalSpecText(p)).toContain('kerf')
  })
})

describe('acessórios nos pacotes', () => {
  function setup() {
    const c = createDefaultConfig()
    const sq = createAccessoryInstance('esquadro-90', c)
    sq.quantity = 4
    const l = createAccessoryInstance('cantoneira-l', c)
    l.quantity = 2
    c.accessories = [sq, l]
    return { c, p: generateProject(c), acc: resolveAccessories(c) }
  }

  it('ZIP do acessório reflete os componentes reais', () => {
    const { acc } = setup()
    const outDir = process.env.DXF_OUT
    if (outDir) {
      // todos os acessórios, para a auditoria com ezdxf
      const c = createDefaultConfig()
      c.accessories = ['esquadro-90', 'cantoneira-l', 'barra-reta', 'barra-v'].map((id) => createAccessoryInstance(id, c))
      for (const a of resolveAccessories(c)) {
        mkdirSync(join(outDir, 'acessorios'), { recursive: true })
        for (const b of a.bom) writeFileSync(join(outDir, 'acessorios', b.fileName), partToDxf(b.geometry))
      }
    }
    expect(accessoryPackageFiles(acc[0]).map((f) => f.path)).toEqual([
      'Esquadro_de_fixacao_90/DXF/01_Face_vertical.dxf',
      'Esquadro_de_fixacao_90/DXF/02_Base.dxf',
      'Esquadro_de_fixacao_90/DXF/03_Reforco_triangular.dxf',
      'Esquadro_de_fixacao_90/Lista_de_Pecas.csv',
      'Esquadro_de_fixacao_90/Especificacoes.txt',
      'Esquadro_de_fixacao_90/configuracao.json',
    ])
  })

  it('projeto completo inclui acessórios na lista, no pedido e nos DXF', () => {
    const { p, acc } = setup()
    const files = projectPackageFiles(p, acc)
    const dxf = files.map((f) => f.path).filter((f) => f.includes('/Acessorios/'))
    expect(dxf).toHaveLength(4)
    const csv = files.find((f) => f.path.endsWith('.csv'))!.data as string
    expect(csv).toContain('A1.3;Esquadro de fixação 90° — Reforço triangular;8;')
    expect(csv).toContain('A2.1;Cantoneira plana em L — Cantoneira;2;')
    const quote = quoteRequestText(p, acc)
    expect(quote).toContain('Esquadro de fixação 90° — 4 conjuntos:')
    expect(quote).toContain('A1_Esquadro_de_fixacao_90_03_Reforco_triangular.dxf — 8 unidades — chapa 6,35 mm')
  })

  it('acessório com erro bloqueia o pacote', () => {
    const { c } = setup()
    c.accessories[1].params.armWidth = 500
    expect(() => projectPackageFiles(generateProject(c), resolveAccessories(c))).toThrow(/Cantoneira/)
  })
})
