// Modelo de dados do MesaFácil. Todas as medidas em milímetros.
//
// Sistema de coordenadas do mundo (montagem):
//   X = comprimento do tampo, Y = largura do tampo, Z = altura.
//   Origem no canto inferior esquerdo do tampo visto de cima; Z = 0 na face
//   inferior do tampo (o tampo ocupa 0..espessura em Z; laterais e reforços
//   ficam em Z negativo).
// Cada peça é descrita em coordenadas locais 2D (plano da chapa) e posicionada
// no mundo por uma ou mais instâncias (`PartInstance`).

import type { AccessoryInstance } from './accessories/types'

export const PROJECT_FILE_VERSION = 1

export type HoleMode = 'auto' | 'manual'
export type SideArrangement = 'all' | 'long' | 'short'
export type RibLayout = 'longitudinal' | 'transverse' | 'grid'

export interface TopConfig {
  length: number
  width: number
  thickness: number
  holes: {
    enabled: boolean
    diameter: number
    pitchX: number
    pitchY: number
    mode: HoleMode
    /** Modo automático: distância mínima do centro do furo à borda. Modo manual: distância mínima na borda oposta. */
    minMargin: number
    /** Modo manual: distância do centro do primeiro furo à borda esquerda (X = 0). */
    startX: number
    /** Modo manual: distância do centro do primeiro furo à borda inferior (Y = 0). */
    startY: number
  }
}

export interface SidesConfig {
  enabled: boolean
  arrangement: SideArrangement
  height: number
  thickness: number
  /** Distância da face externa da lateral até a borda externa do tampo. */
  setback: number
  slotIntoTop: boolean
  holes: {
    enabled: boolean
    diameter: number
    pitchX: number
    pitchY: number
    /** Distância mínima do centro do furo às bordas da chapa lateral. */
    margin: number
  }
}

export interface RibsConfig {
  enabled: boolean
  layout: RibLayout
  height: number
  thickness: number
  countLongitudinal: number
  countTransverse: number
  /** Distância da extremidade do reforço até a borda do tampo quando não há lateral naquele lado. */
  endSetback: number
  /** Desloca cada reforço para o vão entre linhas de furos mais próximo. */
  alignBetweenHoles: boolean
  /** Grade cruzada: encaixe de meia altura entre reforços. */
  interlock: boolean
  slotIntoTop: boolean
  /** Pontas dos reforços com aba que atravessa um rasgo na lateral (quando há lateral naquele lado). */
  slotIntoSides: boolean
}

export interface JointsConfig {
  /** Folga total: largura do rasgo = espessura da peça que entra + folga. */
  clearance: number
  tabWidth: number
  /** Distância máxima desejada entre centros de abas consecutivas. */
  tabSpacing: number
  /** Distância mínima da extremidade da peça até a aba. */
  tabEndDistance: number
  /** Material mínimo entre recortes, furos e bordas. */
  minWeb: number
}

export interface QuoteConfig {
  material: string
  notes: string
}

export interface ProjectConfig {
  version: typeof PROJECT_FILE_VERSION
  top: TopConfig
  sides: SidesConfig
  ribs: RibsConfig
  joints: JointsConfig
  quote: QuoteConfig
  /** Acessórios incluídos no projeto (gerados com o padrão de furos da mesa ou um próprio). */
  accessories: AccessoryInstance[]
}

// ---------------------------------------------------------------------------
// Geometria

export interface Point {
  x: number
  y: number
  /**
   * Arco do segmento que sai deste ponto até o próximo, na convenção DXF:
   * bulge = tan(ângulo/4); positivo = sentido anti-horário. Ausente ou 0 = reta.
   */
  bulge?: number
}

export interface Circle {
  x: number
  y: number
  r: number
}

/** Contorno fechado de retas e arcos, sentido anti-horário, sem repetir o primeiro ponto no fim. */
export type Polygon = Point[]

export interface PartGeometry {
  outer: Polygon
  holes: Circle[]
  /** Recortes internos (rasgos). Recortes de borda fazem parte do contorno externo. */
  cutouts: Polygon[]
}

export type Vec3 = [number, number, number]

/**
 * Posição de uma peça no mundo: o ponto local (x, y) vai para origin + x·u + y·v;
 * a espessura cresce no sentido n.
 */
export interface PartInstance {
  label: string
  origin: Vec3
  u: Vec3
  v: Vec3
  n: Vec3
}

export type PartKind = 'top' | 'sideLong' | 'sideShort' | 'ribLongitudinal' | 'ribTransverse' | 'accessory'

export interface GeneratedPart {
  id: string
  kind: PartKind
  name: string
  thickness: number
  geometry: PartGeometry
  /** Cada peça física tem uma única posição; peças iguais são agrupadas na lista de peças. */
  placement: PartInstance
}

// ---------------------------------------------------------------------------
// Validação

export type Severity = 'error' | 'warning'

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface ValidationIssue {
  severity: Severity
  code: string
  message: string
  /** Região no tampo (coordenadas do mundo, vista superior) para destacar no desenho. */
  markers?: Rect[]
}

// ---------------------------------------------------------------------------
// Lista de peças

export interface BomItem {
  code: string
  description: string
  kind: PartKind
  quantity: number
  length: number
  height: number
  thickness: number
  fileName: string
  holeCount: number
  /** Área líquida exata de uma unidade (mm²), descontando furos e recortes. */
  netArea: number
  /** Peças geradas que compartilham esta geometria. */
  partIds: string[]
  geometry: PartGeometry
}

export interface ProjectStats {
  topHoleCount: number
  totalComponents: number
  uniqueParts: number
  sideCount: number
  ribCount: number
}

export interface GeneratedProject {
  config: ProjectConfig
  parts: GeneratedPart[]
  bom: BomItem[]
  stats: ProjectStats
  issues: ValidationIssue[]
  /** true quando não há erros: a exportação para fabricação é permitida. */
  canExport: boolean
}
