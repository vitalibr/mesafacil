import type { PartGeometry, PartInstance, ValidationIssue } from '../types'

/** Padrão de furação usado por um acessório: o da mesa ou um personalizado. */
export interface HolePattern {
  /** Diâmetro dos furos da mesa (os pinos de fixação passam por eles). */
  diameter: number
  pitchX: number
  pitchY: number
}

export type ParamValue = number | string | boolean

export interface ParamSpec {
  key: string
  label: string
  kind: 'mm' | 'count' | 'select' | 'boolean'
  help?: string
  options?: { value: string; label: string }[]
  /** Faixa aceita para números (validação de entrada). */
  min?: number
  max?: number
  /** Agrupamento na interface. */
  group?: 'principal' | 'avancado'
}

export interface AccessoryPart {
  id: string
  name: string
  thickness: number
  geometry: PartGeometry
  /** Posição no conjunto montado (Z para cima, apoiado na mesa em Z = 0). Ausente = deitada na mesa. */
  placement?: PartInstance
}

export interface AccessoryDimension {
  label: string
  value: number
}

export interface AccessoryBuild {
  parts: AccessoryPart[]
  issues: ValidationIssue[]
  /** Dimensões principais do conjunto montado (mm). */
  dimensions: AccessoryDimension[]
  /** Descrição curta das relações de montagem entre as chapas, quando houver mais de uma. */
  assembly?: string[]
}

export interface AccessoryDefinition {
  id: string
  name: string
  category: string
  description: string
  /** Componente de origem no projeto "Mesa de Solda" do Fusion 360. */
  fusionSource: string
  params: ParamSpec[]
  defaults: Record<string, ParamValue>
  build: (pattern: HolePattern, params: Record<string, ParamValue>) => AccessoryBuild
}

/** Acessório adicionado ao projeto, com quantidade e parâmetros próprios. */
export interface AccessoryInstance {
  uid: string
  typeId: string
  quantity: number
  /** Herdar diâmetro e espaçamento dos furos da mesa configurada. */
  useTablePattern: boolean
  pattern: HolePattern
  params: Record<string, ParamValue>
}
