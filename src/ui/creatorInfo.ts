import { storage } from './storage'

export const CREATOR = {
  name: 'VM Garage',
  youtube: 'https://www.youtube.com/@vmgarage_oficial',
  instagram: 'https://www.instagram.com/vmgarage.oficial/',
  logo: `${import.meta.env.BASE_URL}vm-garage.png`,
}

const KEY = 'mesafacil:criador'
const INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/** Mostra a divulgação ao abrir a página, no máximo uma vez a cada 7 dias. */
export function creatorDue(): boolean {
  const last = Number(storage.get(KEY) ?? 0)
  return !Number.isFinite(last) || Date.now() - last > INTERVAL_MS
}

export function markCreatorShown() {
  storage.set(KEY, String(Date.now()))
}

