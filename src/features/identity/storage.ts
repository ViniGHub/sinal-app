import { isValidPeerId, sanitizeName } from '@/features/session/protocol'
import { safeStorage } from '@/shared/safeStorage'

const ID_KEY = 'sinal.peerId'
const NAME_KEY = 'sinal.displayName'

/** Unambiguous alphabet: no 0/O or 1/l, so an id can be read out loud. */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'
const ID_LENGTH = 12

export function generatePeerId(): string {
  const bytes = new Uint8Array(ID_LENGTH)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return `sinal-${id}`
}

/**
 * Returns a stable id across reloads so a shared invite link keeps working.
 * The broker rejects an id that is still held by a zombie session; callers
 * handle that by calling `rotatePeerId`.
 */
export function loadPeerId(): string {
  const store = safeStorage()
  const saved = store?.getItem(ID_KEY)
  if (isValidPeerId(saved)) return saved
  const fresh = generatePeerId()
  store?.setItem(ID_KEY, fresh)
  return fresh
}

/** Discards the stored id after the broker reported it as unavailable. */
export function rotatePeerId(): string {
  const fresh = generatePeerId()
  safeStorage()?.setItem(ID_KEY, fresh)
  return fresh
}

export function loadDisplayName(): string {
  return sanitizeName(safeStorage()?.getItem(NAME_KEY))
}

export function saveDisplayName(name: string): void {
  safeStorage()?.setItem(NAME_KEY, sanitizeName(name))
}
