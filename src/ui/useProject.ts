import { useEffect, useMemo, useState } from 'react'
import { createDefaultConfig } from '../engine/defaults'
import { generateProject } from '../engine/generate'
import { parseProject, serializeProject } from '../engine/serialize'
import type { ProjectConfig } from '../engine/types'
import { storage } from './storage'

const STORAGE_KEY = 'mesafacil:projeto'

function loadInitial(): ProjectConfig {
  const saved = storage.get(STORAGE_KEY)
  if (saved) {
    const r = parseProject(saved)
    if (r.ok) return r.config
  }
  return createDefaultConfig()
}

/** Estado do projeto: configuração editável e geometria derivada (fonte única). */
export function useProject() {
  const [config, setConfig] = useState<ProjectConfig>(loadInitial)
  const project = useMemo(() => generateProject(config), [config])

  // Preserva automaticamente a última configuração válida (sem erros).
  useEffect(() => {
    if (project.canExport) storage.set(STORAGE_KEY, serializeProject(config))
  }, [config, project.canExport])

  return { config, setConfig, project }
}

/** Atualização imutável de um campo aninhado da configuração. */
export type Updater = <S extends keyof Omit<ProjectConfig, 'version'>>(
  section: S,
  patch: Partial<ProjectConfig[S]>,
) => void
