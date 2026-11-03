import type { ResolvedAccessory } from '../engine/accessories'
import type { BomItem, GeneratedProject } from '../engine/types'
import { bomToCsv, projectBaseName, quoteRequestText } from '../export/documents'
import { track } from './analytics'
import { copyText, downloadBlob, downloadText } from './storage'

// DXF e ZIP são carregados só na primeira exportação, para a página abrir mais rápido.
const loadDxf = () => import('../export/dxf')
const loadZip = () => import('../export/zip')

export type Notify = (message: string, tone?: 'ok' | 'error') => void

/** Exportações disponíveis na interface; todas usam a mesma geometria do desenho. */
export function makeActions(project: GeneratedProject, accessories: ResolvedAccessory[], notify: Notify) {
  const blocked = !project.canExport || accessories.some((a) => !a.canExport)
  const guard = () => {
    if (!project.canExport) notify('Corrija os erros do projeto antes de exportar.', 'error')
    else if (accessories.some((a) => !a.canExport)) notify('Um acessório incluído tem erros. Corrija ou remova antes de exportar.', 'error')
    return !blocked
  }
  return {
    blocked,
    async zip() {
      if (!guard()) return
      const { buildProjectZip } = await loadZip()
      downloadBlob(await buildProjectZip(project, accessories), `${projectBaseName(project)}.zip`)
      track('baixar-zip')
      notify('Projeto completo baixado.')
    },
    csv() {
      if (!guard()) return
      downloadText(bomToCsv(project, accessories), 'Lista_de_Pecas.csv', 'text/csv;charset=utf-8')
      track('baixar-csv')
      notify('Lista de peças baixada.')
    },
    async dxf(item: BomItem) {
      if (!guard()) return
      const { partToDxf } = await loadDxf()
      downloadText(partToDxf(item.geometry), item.fileName, 'application/dxf')
      track('baixar-dxf', item.fileName)
      notify(`${item.fileName} baixado.`)
    },
    async quote() {
      if (!guard()) return
      const ok = await copyText(quoteRequestText(project, accessories))
      if (ok) track('copiar-orcamento')
      notify(ok ? 'Pedido de orçamento copiado. Cole no e-mail ou WhatsApp.' : 'Não foi possível copiar. Tente pelo arquivo do ZIP.', ok ? 'ok' : 'error')
    },
  }
}

export async function downloadAccessoryZip(a: ResolvedAccessory, notify: Notify) {
  if (!a.canExport) return notify('Corrija os erros do acessório antes de exportar.', 'error')
  const { accessoryPackageFiles, zipFiles } = await loadZip()
  const files = accessoryPackageFiles(a)
  downloadBlob(await zipFiles(files), `${files[0].path.split('/')[0]}.zip`)
  track('acessorio-baixar-zip', a.def.id)
  notify('Acessório baixado.')
}

export async function downloadItemDxf(item: BomItem, notify: Notify) {
  const { partToDxf } = await loadDxf()
  downloadText(partToDxf(item.geometry), item.fileName, 'application/dxf')
  track('baixar-dxf', item.fileName)
  notify(`${item.fileName} baixado.`)
}
