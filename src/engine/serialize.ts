import { accessoryById } from './accessories/catalog'
import type { AccessoryInstance } from './accessories/types'
import { createDefaultConfig } from './defaults'
import { PROJECT_FILE_VERSION, type ProjectConfig } from './types'

export const APP_ID = 'MesaFacil'

const ENUMS: Record<string, readonly string[]> = {
  'top.holes.mode': ['auto', 'manual'],
  'sides.arrangement': ['all', 'long', 'short'],
  'ribs.layout': ['longitudinal', 'transverse', 'grid'],
}

const MAX_TEXT = 2000

export function serializeProject(config: ProjectConfig): string {
  return JSON.stringify({ app: APP_ID, ...config, version: PROJECT_FILE_VERSION }, null, 2)
}

export type ParseResult =
  | { ok: true; config: ProjectConfig; notices: string[] }
  | { ok: false; error: string }

/**
 * Lê um projeto salvo sem confiar no conteúdo: confere a versão, o tipo de
 * cada campo e os valores permitidos. Campos ausentes recebem o valor padrão
 * e são informados em `notices`; campos com tipo errado invalidam o arquivo.
 * A coerência geométrica é verificada depois, pelo gerador.
 */
export function parseProject(text: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'O arquivo não é um JSON válido.' }
  }
  if (!isObject(data)) return { ok: false, error: 'O arquivo não contém um projeto do MesaFácil.' }
  if (data.app !== undefined && data.app !== APP_ID) return { ok: false, error: 'O arquivo não é um projeto do MesaFácil.' }
  if (typeof data.version !== 'number' || !Number.isInteger(data.version) || data.version < 1) {
    return { ok: false, error: 'O arquivo não informa uma versão de projeto válida.' }
  }
  if (data.version > PROJECT_FILE_VERSION) {
    return { ok: false, error: `O arquivo foi criado por uma versão mais nova do MesaFácil (formato ${data.version}).` }
  }

  const notices: string[] = []
  const errors: string[] = []
  const config = createDefaultConfig()
  merge(config as unknown as Record<string, unknown>, data, '', notices, errors)
  if (errors.length) return { ok: false, error: `Arquivo inválido: ${errors.slice(0, 5).join('; ')}.` }
  return { ok: true, config, notices }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function merge(target: Record<string, unknown>, source: Record<string, unknown>, prefix: string, notices: string[], errors: string[]) {
  for (const key of Object.keys(target)) {
    if (key === 'version') continue
    if (key === 'accessories' && !prefix) {
      const value = source[key]
      if (value === undefined) continue
      if (!Array.isArray(value)) errors.push('"accessories" deveria ser uma lista')
      else target[key] = parseAccessories(value, errors)
      continue
    }
    const path = prefix ? `${prefix}.${key}` : key
    const def = target[key]
    const value = source[key]
    if (value === undefined) {
      notices.push(`Campo "${path}" ausente; usado o valor padrão.`)
      continue
    }
    if (isObject(def)) {
      if (!isObject(value)) errors.push(`"${path}" deveria ser um grupo de campos`)
      else merge(def, value, path, notices, errors)
    } else if (typeof def === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`"${path}" deveria ser um número`)
      else target[key] = value
    } else if (typeof def === 'boolean') {
      if (typeof value !== 'boolean') errors.push(`"${path}" deveria ser verdadeiro ou falso`)
      else target[key] = value
    } else if (typeof def === 'string') {
      const allowed = ENUMS[path]
      if (typeof value !== 'string') errors.push(`"${path}" deveria ser um texto`)
      else if (allowed && !allowed.includes(value)) errors.push(`"${path}" tem valor desconhecido "${value.slice(0, 40)}"`)
      else target[key] = value.slice(0, MAX_TEXT)
    }
  }
}

const MAX_ACCESSORIES = 50

function parseAccessories(list: unknown[], errors: string[]): AccessoryInstance[] {
  const out: AccessoryInstance[] = []
  if (list.length > MAX_ACCESSORIES) {
    errors.push(`no máximo ${MAX_ACCESSORIES} acessórios por projeto`)
    return out
  }
  list.forEach((item, i) => {
    const where = `acessório ${i + 1}`
    if (!isObject(item)) return errors.push(`${where} inválido`)
    const def = typeof item.typeId === 'string' ? accessoryById(item.typeId) : undefined
    if (!def) return errors.push(`${where}: tipo desconhecido`)
    const pat = item.pattern
    if (!isObject(pat) || !['diameter', 'pitchX', 'pitchY'].every((k) => typeof pat[k] === 'number' && Number.isFinite(pat[k]))) {
      return errors.push(`${where}: padrão de furação inválido`)
    }
    if (typeof item.quantity !== 'number' || typeof item.useTablePattern !== 'boolean' || !isObject(item.params)) {
      return errors.push(`${where}: campos inválidos`)
    }
    const params = { ...def.defaults }
    for (const [k, dv] of Object.entries(def.defaults)) {
      const v = (item.params as Record<string, unknown>)[k]
      if (v === undefined) continue
      if (typeof v !== typeof dv || (typeof v === 'number' && !Number.isFinite(v))) return errors.push(`${where}: parâmetro "${k}" inválido`)
      params[k] = typeof v === 'string' ? v.slice(0, 40) : (v as number | boolean)
    }
    out.push({
      uid: typeof item.uid === 'string' ? item.uid.slice(0, 40) : `importado${i}`,
      typeId: def.id,
      quantity: item.quantity,
      useTablePattern: item.useTablePattern,
      pattern: { diameter: pat.diameter as number, pitchX: pat.pitchX as number, pitchY: pat.pitchY as number },
      params,
    })
  })
  return out
}
