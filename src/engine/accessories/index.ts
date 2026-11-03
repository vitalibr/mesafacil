import { fileSlug, groupIdentical, normalizeGeometry } from '../bom'
import { exactBounds, netArea } from '../geom'
import type { BomItem, ProjectConfig, ValidationIssue } from '../types'
import { ACCESSORIES, accessoryById } from './catalog'
import type { AccessoryBuild, AccessoryDefinition, AccessoryInstance, HolePattern } from './types'

export { ACCESSORIES, accessoryById }
export type * from './types'

export function tablePattern(c: ProjectConfig): HolePattern | null {
  const h = c.top.holes
  return h.enabled ? { diameter: h.diameter, pitchX: h.pitchX, pitchY: h.pitchY } : null
}

let counter = 0
export function newAccessoryUid(): string {
  counter += 1
  return `a${Date.now().toString(36)}${counter}`
}

export function createAccessoryInstance(typeId: string, c: ProjectConfig): AccessoryInstance {
  const def = accessoryById(typeId)
  if (!def) throw new Error(`Acessório desconhecido: ${typeId}`)
  const table = tablePattern(c)
  return {
    uid: newAccessoryUid(),
    typeId,
    quantity: 1,
    useTablePattern: table !== null,
    pattern: table ?? { diameter: 15.8, pitchX: 50, pitchY: 50 },
    params: { ...def.defaults },
  }
}

export interface ResolvedAccessory {
  instance: AccessoryInstance
  def: AccessoryDefinition
  pattern: HolePattern
  build: AccessoryBuild
  /** Problemas do acessório, incluindo a compatibilidade com a mesa. */
  issues: ValidationIssue[]
  canExport: boolean
  bom: BomItem[]
  slug: string
}

/** Gera o acessório com o padrão de furação efetivo (o da mesa ou o personalizado). */
export function resolveAccessory(instance: AccessoryInstance, c: ProjectConfig, index = 0): ResolvedAccessory | null {
  const def = accessoryById(instance.typeId)
  if (!def) return null
  const table = tablePattern(c)
  const issues: ValidationIssue[] = []
  let pattern = instance.pattern
  if (instance.useTablePattern) {
    if (table) pattern = table
    else issues.push({ severity: 'error', code: 'accessory-pattern', message: 'A mesa está sem furos: desative "Usar padrão de furos da minha mesa" e informe o padrão.' })
  } else if (table) {
    const diffs: string[] = []
    if (Math.abs(pattern.diameter - table.diameter) > 1e-9) diffs.push(`diâmetro Ø${pattern.diameter} (mesa Ø${table.diameter})`)
    if (Math.abs(pattern.pitchX - table.pitchX) > 1e-9) diffs.push(`passo X ${pattern.pitchX} (mesa ${table.pitchX})`)
    if (Math.abs(pattern.pitchY - table.pitchY) > 1e-9) diffs.push(`passo Y ${pattern.pitchY} (mesa ${table.pitchY})`)
    if (diffs.length) issues.push({ severity: 'warning', code: 'accessory-incompatible', message: `Padrão personalizado não é compatível com a mesa atual: ${diffs.join(', ')}.` })
  }
  if (!Number.isInteger(instance.quantity) || instance.quantity < 1 || instance.quantity > 500) {
    issues.push({ severity: 'error', code: 'accessory-quantity', message: 'A quantidade deve ser um número inteiro entre 1 e 500.' })
  }
  const build = def.build(pattern, { ...def.defaults, ...instance.params })
  issues.push(...build.issues)
  const canExport = !issues.some((i) => i.severity === 'error') && build.parts.length > 0
  const slug = `A${index + 1}_${fileSlug(def.name)}`
  const qty = Number.isInteger(instance.quantity) && instance.quantity > 0 ? instance.quantity : 1
  const bom: BomItem[] = groupIdentical(build.parts).map((group, gi) => {
    const geometry = normalizeGeometry(group[0].geometry)
    const b = exactBounds(geometry.outer)
    const code = `A${index + 1}.${gi + 1}`
    return {
      code,
      description: `${def.name} — ${group[0].name}`,
      kind: 'accessory',
      quantity: group.length * qty,
      length: b.x1 - b.x0,
      height: b.y1 - b.y0,
      thickness: group[0].thickness,
      fileName: `${slug}_${String(gi + 1).padStart(2, '0')}_${fileSlug(group[0].name)}.dxf`,
      holeCount: geometry.holes.length,
      netArea: netArea(geometry),
      partIds: group.map((p) => p.id),
      geometry,
    }
  })
  return { instance, def, pattern, build, issues, canExport, bom, slug }
}

export function resolveAccessories(c: ProjectConfig): ResolvedAccessory[] {
  return c.accessories.map((a, i) => resolveAccessory(a, c, i)).filter((a): a is ResolvedAccessory => a !== null)
}
