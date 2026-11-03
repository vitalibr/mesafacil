import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from './defaults'
import { generateProject } from './generate'
import { polygonBounds, rectGap } from './geom'
import { autoGridPositions, manualGridPositions } from './holes'
import { parseProject, serializeProject } from './serialize'
import type { GeneratedPart, GeneratedProject, ProjectConfig } from './types'
import { validatePartGeometry } from './validateGeometry'

function cfg(mut: (c: ProjectConfig) => void = () => {}): ProjectConfig {
  const c = createDefaultConfig()
  mut(c)
  return c
}

const errors = (p: GeneratedProject) => p.issues.filter((i) => i.severity === 'error')
const codes = (p: GeneratedProject) => p.issues.map((i) => i.code)
const part = (p: GeneratedProject, id: string) => p.parts.find((q) => q.id === id) as GeneratedPart
const bounds = (q: GeneratedPart) => polygonBounds(q.geometry.outer)

function withFullStructure(c: ProjectConfig) {
  c.sides.enabled = true
  c.ribs.enabled = true
}

/** Abas da borda superior de uma chapa vertical: trechos do contorno acima de `height`. */
function tabsOf(q: GeneratedPart, height: number) {
  const pts = q.geometry.outer
  const xs = pts.filter((p) => p.y > height + 1e-9).map((p) => p.x)
  const tabs: { a: number; b: number; top: number }[] = []
  for (let i = 0; i < xs.length; i += 2) {
    const b = Math.max(xs[i], xs[i + 1])
    const a = Math.min(xs[i], xs[i + 1])
    tabs.push({ a, b, top: pts.find((p) => p.y > height + 1e-9)!.y })
  }
  return tabs.sort((p, q2) => p.a - q2.a)
}

describe('distribuição dos furos do tampo', () => {
  it('caso de referência 1200 × 800, Ø16, passo 50, margem 25: 24 × 16 = 384 furos', () => {
    const p = generateProject(cfg())
    const holes = part(p, 'top').geometry.holes
    const xs = [...new Set(holes.map((h) => h.x))].sort((a, b) => a - b)
    const ys = [...new Set(holes.map((h) => h.y))].sort((a, b) => a - b)
    expect(xs).toHaveLength(24)
    expect(ys).toHaveLength(16)
    expect(holes).toHaveLength(384)
    expect(xs[0]).toBeCloseTo(25)
    expect(xs.at(-1)).toBeCloseTo(1175)
    expect(ys[0]).toBeCloseTo(25)
    expect(ys.at(-1)).toBeCloseTo(775)
    expect(holes.every((h) => h.r === 8)).toBe(true)
    expect(p.stats.topHoleCount).toBe(384)
    expect(errors(p)).toEqual([])
    expect(p.canExport).toBe(true)
  })

  it('centraliza a malha quando a medida não é múltipla do passo', () => {
    const xs = autoGridPositions(1210, 50, 25)
    expect(xs).toHaveLength(24)
    expect(xs[0]).toBeCloseTo(30)
    expect(1210 - xs.at(-1)!).toBeCloseTo(30)
  })

  it('modo manual mantém o primeiro furo e o passo, respeitando a margem na borda oposta', () => {
    expect(manualGridPositions(1200, 50, 40, 25)).toEqual(Array.from({ length: 23 }, (_, i) => 40 + i * 50))
    const p = generateProject(cfg((c) => Object.assign(c.top.holes, { mode: 'manual', startX: 40, startY: 30 })))
    const holes = part(p, 'top').geometry.holes
    expect(Math.min(...holes.map((h) => h.x))).toBeCloseTo(40)
    expect(Math.min(...holes.map((h) => h.y))).toBeCloseTo(30)
    expect(holes).toHaveLength(23 * 15)
  })

  it('acompanha alterações de comprimento e largura', () => {
    expect(part(generateProject(cfg((c) => (c.top.length = 1000))), 'top').geometry.holes).toHaveLength(20 * 16)
    expect(part(generateProject(cfg((c) => (c.top.width = 600))), 'top').geometry.holes).toHaveLength(24 * 12)
    const b = bounds(part(generateProject(cfg((c) => (c.top.length = 1500))), 'top'))
    expect(b.x1 - b.x0).toBe(1500)
  })

  it('detecta furos sobrepostos e bloqueia a exportação', () => {
    const p = generateProject(cfg((c) => (c.top.holes.diameter = 50)))
    expect(codes(p)).toContain('holes-overlap-x')
    expect(p.canExport).toBe(false)
    expect(p.issues.find((i) => i.code === 'holes-overlap-x')!.message).toMatch(/maior ou igual ao espaçamento/)
  })

  it('detecta furos que cortam a borda e avisa sobre pouco material na borda', () => {
    const cut = generateProject(cfg((c) => (c.top.holes.minMargin = 8)))
    expect(codes(cut)).toContain('holes-edge')
    expect(cut.canExport).toBe(false)
    const thin = generateProject(cfg((c) => (c.top.holes.minMargin = 10)))
    expect(codes(thin)).toContain('holes-edge-web')
    expect(thin.canExport).toBe(true)
  })

  it('rejeita dimensões negativas, zero e espaçamento inválido', () => {
    expect(generateProject(cfg((c) => (c.top.length = -10))).canExport).toBe(false)
    expect(generateProject(cfg((c) => (c.top.holes.pitchX = 0))).canExport).toBe(false)
    expect(generateProject(cfg((c) => (c.top.thickness = Number.NaN))).canExport).toBe(false)
  })
})

describe('laterais', () => {
  it('convenção dos cantos: longas externas, curtas entre as longas', () => {
    const p = generateProject(cfg((c) => (c.sides.enabled = true)))
    expect(errors(p)).toEqual([])
    const { setback: r, thickness: t, height: H } = createDefaultConfig().sides
    const long = part(p, 'side-long-1')
    const short = part(p, 'side-short-1')
    // comprimento do corpo da chapa (sem abas): borda inferior
    const bottomLen = (q: GeneratedPart) => {
      const ys = q.geometry.outer.filter((pt) => pt.y === 0).map((pt) => pt.x)
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(bottomLen(long)).toBeCloseTo(1200 - 2 * r)
    expect(bottomLen(short)).toBeCloseTo(800 - 2 * r - 2 * t)
    expect(short.placement.origin[1]).toBeCloseTo(r + t)
    expect(bounds(long).y1).toBeCloseTo(H + 6) // aba atravessa o tampo de 6 mm
    expect(p.stats.sideCount).toBe(4)
  })

  it('apenas lados menores usam a largura total menos o recuo', () => {
    const p = generateProject(cfg((c) => Object.assign(c.sides, { enabled: true, arrangement: 'short', slotIntoTop: false })))
    const b = bounds(part(p, 'side-short-1'))
    expect(b.x1 - b.x0).toBeCloseTo(800 - 2 * 5)
    expect(p.parts.filter((q) => q.kind === 'sideLong')).toHaveLength(0)
  })

  it('sem encaixe, laterais são retângulos simples', () => {
    const p = generateProject(cfg((c) => Object.assign(c.sides, { enabled: true, slotIntoTop: false })))
    expect(part(p, 'side-long-1').geometry.outer).toHaveLength(4)
    expect(part(p, 'top').geometry.cutouts).toHaveLength(0)
  })

  it('furos laterais distribuídos dentro da chapa', () => {
    const p = generateProject(cfg((c) => Object.assign(c.sides, { enabled: true, holes: { ...c.sides.holes, enabled: true } })))
    const long = part(p, 'side-long-1')
    expect(long.geometry.holes.length).toBeGreaterThan(0)
    const ys = new Set(long.geometry.holes.map((h) => h.y))
    expect([...ys].every((y) => y >= 35 - 1e-9 && y <= 120 - 35 + 1e-9)).toBe(true)
    expect(validatePartGeometry(long.geometry)).toEqual([])
  })
})

describe('abas e rasgos no tampo', () => {
  it('cada aba tem um rasgo correspondente com a folga configurada', () => {
    for (const clearance of [0, 0.5, 1.2]) {
      const p = generateProject(cfg((c) => {
        c.sides.enabled = true
        c.joints.clearance = clearance
      }))
      expect(errors(p)).toEqual([])
      const top = part(p, 'top')
      const t = 6
      let tabCount = 0
      for (const side of p.parts.filter((q) => q.kind.startsWith('side'))) {
        for (const tab of tabsOf(side, 120)) {
          tabCount++
          expect(tab.b - tab.a).toBeCloseTo(40)
          expect(tab.top).toBeCloseTo(120 + 6) // profundidade = espessura do tampo
          // rasgo esperado na vista superior
          const pl = side.placement
          const along = pl.u[0] === 1 ? 'x' : 'y'
          const s0 = (along === 'x' ? pl.origin[0] : pl.origin[1]) + tab.a - clearance / 2
          const s1 = (along === 'x' ? pl.origin[0] : pl.origin[1]) + tab.b + clearance / 2
          const w0 = (along === 'x' ? pl.origin[1] : pl.origin[0]) - clearance / 2
          const w1 = w0 + t + clearance
          const match = top.geometry.cutouts.find((cut) => {
            const b = polygonBounds(cut)
            const [a0, a1, b0, b1] = along === 'x' ? [b.x0, b.x1, b.y0, b.y1] : [b.y0, b.y1, b.x0, b.x1]
            return Math.abs(a0 - s0) < 1e-9 && Math.abs(a1 - s1) < 1e-9 && Math.abs(b0 - w0) < 1e-9 && Math.abs(b1 - w1) < 1e-9
          })
          expect(match).toBeDefined()
        }
      }
      expect(tabCount).toBe(top.geometry.cutouts.length)
      expect(tabCount).toBeGreaterThan(8)
    }
  })

  it('detecta interferência dos rasgos com os furos', () => {
    // lateral sob a linha de furos y = 25: abas de 40 mm não cabem entre furos (vão de 34 mm)
    const p = generateProject(cfg((c) => Object.assign(c.sides, { enabled: true, setback: 20 })))
    expect(codes(p)).toContain('tabs-placement')
    expect(p.canExport).toBe(false)
    expect(p.issues.find((i) => i.code === 'tabs-placement')!.message).toMatch(/furos do tampo/)
  })

  it('posiciona abas estreitas entre os furos quando possível', () => {
    const p = generateProject(cfg((c) => {
      Object.assign(c.sides, { enabled: true, setback: 20 })
      c.joints.tabWidth = 20
    }))
    expect(errors(p)).toEqual([])
    const top = part(p, 'top')
    for (const cut of top.geometry.cutouts) {
      const b = polygonBounds(cut)
      for (const h of top.geometry.holes) {
        const gap = rectGap(b, { x0: h.x - h.r, y0: h.y - h.r, x1: h.x + h.r, y1: h.y + h.r })
        if (gap < 3) {
          // a caixa do furo pode encostar, mas o círculo precisa respeitar o material mínimo
          const dx = Math.max(b.x0 - h.x, 0, h.x - b.x1)
          const dy = Math.max(b.y0 - h.y, 0, h.y - b.y1)
          expect(Math.hypot(dx, dy) - h.r).toBeGreaterThanOrEqual(3 - 1e-9)
        }
      }
    }
  })

  it('recuo insuficiente para o rasgo junto à borda é informado', () => {
    const p = generateProject(cfg((c) => Object.assign(c.sides, { enabled: true, setback: 1 })))
    expect(p.issues.find((i) => i.code === 'tabs-placement')!.message).toMatch(/borda do tampo/)
  })
})

describe('reforços', () => {
  it('quantidade e distribuição uniforme sem alinhamento aos furos', () => {
    const p = generateProject(cfg((c) => {
      Object.assign(c.ribs, { enabled: true, layout: 'longitudinal', countLongitudinal: 3, alignBetweenHoles: false, slotIntoTop: false })
    }))
    const ribs = p.parts.filter((q) => q.kind === 'ribLongitudinal')
    expect(ribs).toHaveLength(3)
    const centers = ribs.map((q) => q.placement.origin[1] + 3)
    const e = 20
    const step = (800 - 2 * e) / 4
    centers.forEach((y, i) => expect(y).toBeCloseTo(e + (i + 1) * step))
    const b = bounds(ribs[0])
    expect(b.x1 - b.x0).toBeCloseTo(1200 - 2 * e)
  })

  it('alinhamento coloca os reforços nos vãos entre linhas de furos', () => {
    const p = generateProject(cfg((c) => {
      c.sides.enabled = true
      c.ribs.enabled = true
    }))
    expect(errors(p)).toEqual([])
    const ys = p.parts.filter((q) => q.kind === 'ribLongitudinal').map((q) => q.placement.origin[1] + 3)
    const xs = p.parts.filter((q) => q.kind === 'ribTransverse').map((q) => q.placement.origin[0] + 3)
    expect(ys).toEqual([250, 550])
    expect(xs).toEqual([300, 600, 900])
    expect(codes(p)).not.toContain('holes-obstructed')
  })

  it('reforços respeitam o espaço interno entre as laterais', () => {
    const p = generateProject(cfg(withFullStructure))
    const long = p.parts.find((q) => q.kind === 'ribLongitudinal')!
    const lb = bounds(long)
    expect(long.placement.origin[0]).toBeCloseTo(5 + 6)
    expect(lb.x1 - lb.x0).toBeCloseTo(1200 - 2 * 11)
    const tr = p.parts.find((q) => q.kind === 'ribTransverse')!
    expect(tr.placement.origin[1]).toBeCloseTo(11)
    expect(bounds(tr).x1 - bounds(tr).x0).toBeCloseTo(800 - 2 * 11)
  })

  it('encaixes de meia altura entre reforços são complementares', () => {
    const clearance = 0.5
    const p = generateProject(cfg((c) => {
      withFullStructure(c)
      c.joints.clearance = clearance
    }))
    const H = 100
    const long = part(p, 'rib-l-1')
    const tr = part(p, 'rib-t-1')
    // entalhes inferiores no longitudinal: pontos com 0 < y <= H/2 no lado de baixo
    const bottomNotchXs = long.geometry.outer.filter((pt) => pt.y === H / 2).map((pt) => pt.x)
    expect(bottomNotchXs).toHaveLength(2 * 3)
    for (let i = 0; i < bottomNotchXs.length; i += 2) {
      const a = bottomNotchXs[i]
      const b = bottomNotchXs[i + 1]
      expect(Math.abs(b - a)).toBeCloseTo(6 + clearance)
      const centerWorld = long.placement.origin[0] + (a + b) / 2
      expect([300, 600, 900].some((x) => Math.abs(x - centerWorld) < 1e-9)).toBe(true)
    }
    // entalhes superiores no transversal, com profundidade H/2: juntos fecham a altura toda
    const topNotchXs = tr.geometry.outer.filter((pt) => pt.y === H / 2).map((pt) => pt.x)
    expect(topNotchXs).toHaveLength(2 * 2)
    for (let i = 0; i < topNotchXs.length; i += 2) {
      const centerWorld = tr.placement.origin[1] + (topNotchXs[i] + topNotchXs[i + 1]) / 2
      expect([250, 550].some((y) => Math.abs(y - centerWorld) < 1e-9)).toBe(true)
    }
    // abas do transversal não ficam sobre os entalhes
    for (const tab of tabsOf(tr, H)) {
      for (let i = 0; i < topNotchXs.length; i += 2) {
        const a = Math.min(topNotchXs[i], topNotchXs[i + 1])
        const b = Math.max(topNotchXs[i], topNotchXs[i + 1])
        expect(tab.b <= a - 3 + 1e-9 || tab.a >= b + 3 - 1e-9).toBe(true)
      }
    }
  })

  it('grade sem encaixe divide os transversais entre os longitudinais', () => {
    const p = generateProject(cfg((c) => {
      withFullStructure(c)
      c.ribs.interlock = false
    }))
    expect(errors(p)).toEqual([])
    const segs = p.parts.filter((q) => q.kind === 'ribTransverse')
    expect(segs).toHaveLength(3 * 3)
    // trechos: 11..247, 253..547, 553..789
    const lens = segs.slice(0, 3).map((q) => {
      const ys = q.geometry.outer.filter((pt) => pt.y === 0).map((pt) => pt.x)
      return Math.max(...ys) - Math.min(...ys)
    })
    expect(lens[0]).toBeCloseTo(247 - 11)
    expect(lens[1]).toBeCloseTo(547 - 253)
    expect(lens[2]).toBeCloseTo(789 - 553)
  })

  it('informa quando não há vãos suficientes entre linhas de furos', () => {
    const p = generateProject(cfg((c) => Object.assign(c.ribs, { enabled: true, layout: 'longitudinal', countLongitudinal: 20 })))
    expect(codes(p)).toContain('ribs-gaps')
  })

  it('avisa sobre furos obstruídos quando os reforços passam sob os furos', () => {
    const p = generateProject(cfg((c) => Object.assign(c.ribs, { enabled: true, layout: 'longitudinal', countLongitudinal: 2, alignBetweenHoles: false, slotIntoTop: false })))
    expect(codes(p)).toContain('holes-obstructed')
    expect(p.canExport).toBe(true)
  })

  it('várias combinações geram somente geometria válida e sem sobreposição', () => {
    for (const layout of ['longitudinal', 'transverse', 'grid'] as const) {
      for (const nL of [1, 2, 3, 5]) {
        for (const nT of [1, 2, 4, 6]) {
          for (const interlock of [true, false]) {
            for (const arrangement of ['all', 'long', 'short'] as const) {
              const p = generateProject(cfg((c) => {
                Object.assign(c.sides, { enabled: true, arrangement })
                Object.assign(c.ribs, { enabled: true, layout, countLongitudinal: nL, countTransverse: nT, interlock, slotIntoSides: nL % 2 === 1 })
              }))
              const errs = errors(p).filter((e) => e.code !== 'ribs-gaps')
              expect(errs, `${layout} ${nL}x${nT} ${interlock} ${arrangement}`).toEqual([])
              for (const q of p.parts) expect(validatePartGeometry(q.geometry), q.name).toEqual([])
            }
          }
        }
      }
    }
  })
})

describe('encaixe dos reforços nas laterais', () => {
  it('cada ponta encostada numa lateral tem aba e a lateral tem o rasgo correspondente', () => {
    const p = generateProject(cfg((c) => {
      withFullStructure(c)
      c.ribs.slotIntoSides = true
    }))
    expect(errors(p)).toEqual([])
    const long = part(p, 'rib-l-1')
    const b = bounds(long)
    // abas de 6 mm (espessura da lateral) nas duas pontas, centradas na altura do reforço (100)
    expect(b.x0).toBeCloseTo(-6)
    expect(b.x1 - b.x0).toBeCloseTo(1178 + 12)
    const tabYs = long.geometry.outer.filter((pt) => pt.x < 0).map((pt) => pt.y)
    expect(Math.min(...tabYs)).toBeCloseTo(30)
    expect(Math.max(...tabYs)).toBeCloseTo(70)
    // lateral curta: um rasgo por reforço longitudinal, 6 + 0,5 de largura e 40 + 0,5 de altura
    const short = part(p, 'side-short-1')
    expect(short.geometry.cutouts).toHaveLength(2)
    const sb = polygonBounds(short.geometry.cutouts[0])
    expect(sb.x1 - sb.x0).toBeCloseTo(6.5)
    expect(sb.y1 - sb.y0).toBeCloseTo(40.5)
    // centro do rasgo na altura do centro da aba: lateral 120, reforço 100 → 70 da base da lateral
    expect((sb.y0 + sb.y1) / 2).toBeCloseTo(70)
    // posição ao longo da lateral = centro do reforço (y = 250) − início da lateral (11)
    expect((sb.x0 + sb.x1) / 2).toBeCloseTo(250 - 11)
    expect(part(p, 'side-long-1').geometry.cutouts).toHaveLength(3)
    expect(p.bom.find((x) => x.kind === 'sideLong')!.quantity).toBe(2)
  })

  it('grade sem encaixe: só os trechos das pontas recebem aba', () => {
    const p = generateProject(cfg((c) => {
      withFullStructure(c)
      c.ribs.interlock = false
      c.ribs.slotIntoSides = true
    }))
    expect(errors(p)).toEqual([])
    const mid = part(p, 'rib-t-1-2')
    expect(bounds(mid).x0).toBeCloseTo(0)
    expect(bounds(part(p, 'rib-t-1-1')).x0).toBeCloseTo(-6)
  })

  it('reforço mais alto que a lateral é recusado com mensagem', () => {
    const p = generateProject(cfg((c) => {
      withFullStructure(c)
      c.ribs.slotIntoSides = true
      c.ribs.height = 200
    }))
    expect(codes(p)).toContain('rib-side-joint')
    expect(p.canExport).toBe(false)
  })

  it('rasgo da lateral respeita os furos laterais', () => {
    const p = generateProject(cfg((c) => {
      withFullStructure(c)
      c.ribs.slotIntoSides = true
      c.sides.holes.enabled = true
      c.sides.holes.margin = 20
      c.sides.holes.pitchY = 40
    }))
    expect(codes(p)).toContain('geometry-invalid')
  })
})

describe('lista de peças', () => {
  it('agrupa peças idênticas considerando furos e encaixes', () => {
    const p = generateProject(cfg(withFullStructure))
    const byKind = Object.fromEntries(p.bom.map((b) => [b.kind, b]))
    expect(p.bom.map((b) => b.fileName)).toEqual([
      '01_Tampo.dxf',
      '02_Lateral_Longa.dxf',
      '03_Lateral_Curta.dxf',
      '04_Reforco_Longitudinal.dxf',
      '05_Reforco_Transversal.dxf',
    ])
    expect(byKind.top.quantity).toBe(1)
    expect(byKind.sideLong.quantity).toBe(2)
    expect(byKind.sideShort.quantity).toBe(2)
    expect(byKind.ribLongitudinal.quantity).toBe(2)
    expect(byKind.ribTransverse.quantity).toBe(3)
    expect(byKind.top.holeCount).toBe(384)
    expect(p.stats.totalComponents).toBe(10)
    expect(p.stats.uniqueParts).toBe(5)
    expect(p.bom.every((b) => b.thickness === 6)).toBe(true)
  })

  it('separa peças de mesmo tamanho externo mas furação diferente', () => {
    const p = generateProject(cfg((c) => {
      c.sides.enabled = true
      c.sides.slotIntoTop = false
      c.sides.holes.enabled = true
      c.top.holes.mode = 'manual'
    }))
    // furos laterais são simétricos: continuam iguais
    expect(p.bom.find((b) => b.kind === 'sideLong')!.quantity).toBe(2)
    // trechos de reforço com comprimentos diferentes viram itens distintos
    const q = generateProject(cfg((c) => {
      withFullStructure(c)
      c.ribs.interlock = false
      c.ribs.countLongitudinal = 3
    }))
    const tr = q.bom.filter((b) => b.kind === 'ribTransverse')
    expect(tr.length).toBeGreaterThan(1)
    expect(tr.reduce((s, b) => s + b.quantity, 0)).toBe(3 * 4)
    expect(tr.map((b) => b.description)).toContain('Reforço transversal A')
  })

  it('espessuras diferentes por componente aparecem na lista', () => {
    const p = generateProject(cfg((c) => {
      withFullStructure(c)
      c.sides.thickness = 4
      c.ribs.thickness = 5
    }))
    const t = Object.fromEntries(p.bom.map((b) => [b.kind, b.thickness]))
    expect(t).toEqual({ top: 6, sideLong: 4, sideShort: 4, ribLongitudinal: 5, ribTransverse: 5 })
  })
})

describe('salvar e carregar projeto', () => {
  it('serializa e recupera a configuração', () => {
    const c = cfg(withFullStructure)
    c.top.length = 1500
    c.quote.material = 'Aço SAE 1020'
    const r = parseProject(serializeProject(c))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.config).toEqual(c)
      expect(r.notices).toEqual([])
    }
  })

  it('rejeita arquivos inválidos sem confiar no conteúdo', () => {
    expect(parseProject('{').ok).toBe(false)
    expect(parseProject('[]').ok).toBe(false)
    expect(parseProject(JSON.stringify({ version: 99 })).ok).toBe(false)
    const bad = JSON.parse(serializeProject(cfg()))
    bad.top.length = '1200'
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false)
    bad.top.length = 1200
    bad.ribs.layout = 'diagonal'
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false)
  })

  it('completa campos ausentes com o padrão e informa', () => {
    const partial = JSON.parse(serializeProject(cfg()))
    delete partial.ribs
    const r = parseProject(JSON.stringify(partial))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.config.ribs).toEqual(createDefaultConfig().ribs)
      expect(r.notices[0]).toMatch(/ribs/)
    }
  })
})
