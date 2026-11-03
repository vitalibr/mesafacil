// Contagem de acessos e de ações com o GoatCounter (sem cookies e sem dados pessoais).
// O script é carregado em index.html e não conta acessos de localhost.

interface GoatCounter {
  count: (vars: { path: string; title?: string; event?: boolean }) => void
}

declare global {
  interface Window {
    goatcounter?: GoatCounter
  }
}

export type TrackedEvent =
  | 'baixar-zip'
  | 'baixar-dxf'
  | 'baixar-csv'
  | 'copiar-orcamento'
  | 'salvar-projeto'
  | 'carregar-projeto'
  | 'abrir-3d'
  | 'animar-montagem'
  | 'acessorio-configurar'
  | 'acessorio-adicionar'
  | 'acessorio-baixar-zip'
  | 'tutorial-concluido'
  | 'tutorial-pulado'
  | 'vmgarage-youtube'
  | 'vmgarage-instagram'

/** Registra um evento; não faz nada se o contador estiver bloqueado ou ausente. */
export function track(event: TrackedEvent, detail?: string) {
  try {
    window.goatcounter?.count({ path: detail ? `${event}/${detail}` : event, title: event, event: true })
  } catch {
    // a contagem nunca pode atrapalhar o uso
  }
}
