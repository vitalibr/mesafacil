import JSZip from 'jszip'
import type { ResolvedAccessory } from '../engine/accessories'
import { serializeProject } from '../engine/serialize'
import type { GeneratedProject } from '../engine/types'
import { partToDxf } from './dxf'
import { accessorySpecText, bomToCsv, itemsToCsv, projectBaseName, quoteRequestText, technicalSpecText } from './documents'

/** Arquivo adicional incluído no pacote, por exemplo os acessórios escolhidos. */
export interface ExtraFile {
  path: string
  data: Uint8Array | string
}

/**
 * Monta a estrutura de arquivos do pacote completo (caminho → conteúdo).
 * Acessórios incluídos ficam em Acessorios/, um DXF por geometria distinta.
 */
export function projectPackageFiles(p: GeneratedProject, accessories: ResolvedAccessory[] = []): ExtraFile[] {
  if (!p.canExport) throw new Error('O projeto tem erros e não pode ser exportado.')
  const broken = accessories.find((a) => !a.canExport)
  if (broken) throw new Error(`O acessório "${broken.def.name}" tem erros e não pode ser exportado.`)
  const root = projectBaseName(p)
  const files: ExtraFile[] = p.bom.map((b) => ({ path: `${root}/DXF/${b.fileName}`, data: partToDxf(b.geometry) }))
  for (const a of accessories) {
    for (const b of a.bom) files.push({ path: `${root}/DXF/Acessorios/${b.fileName}`, data: partToDxf(b.geometry) })
  }
  files.push(
    { path: `${root}/Projeto/configuracao.json`, data: serializeProject(p.config) },
    { path: `${root}/Lista_de_Pecas.csv`, data: bomToCsv(p, accessories) },
    { path: `${root}/Especificacoes_Tecnicas.txt`, data: technicalSpecText(p, new Date(), accessories) },
    { path: `${root}/Pedido_de_Orcamento.txt`, data: quoteRequestText(p, accessories).replace(/\n/g, '\r\n') },
  )
  return files
}

/** Pacote de um acessório sozinho: DXFs, lista de peças, especificações e parâmetros. */
export function accessoryPackageFiles(a: ResolvedAccessory): ExtraFile[] {
  if (!a.canExport) throw new Error('O acessório tem erros e não pode ser exportado.')
  const root = a.slug.replace(/^A\d+_/, '')
  const config = { app: 'MesaFacil', tipo: a.def.id, quantidade: a.instance.quantity, padraoDeFuracao: a.pattern, usaPadraoDaMesa: a.instance.useTablePattern, parametros: a.instance.params }
  return [
    ...a.bom.map((b) => ({ path: `${root}/DXF/${b.fileName.slice(a.slug.length + 1)}`, data: partToDxf(b.geometry) })),
    { path: `${root}/Lista_de_Pecas.csv`, data: itemsToCsv(a.bom) },
    { path: `${root}/Especificacoes.txt`, data: accessorySpecText(a) },
    { path: `${root}/configuracao.json`, data: JSON.stringify(config, null, 2) },
  ]
}

export async function zipFiles(files: ExtraFile[]): Promise<Blob> {
  const zip = new JSZip()
  for (const f of files) zip.file(f.path, f.data)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function buildProjectZip(p: GeneratedProject, accessories: ResolvedAccessory[] = []): Promise<Blob> {
  return zipFiles(projectPackageFiles(p, accessories))
}
