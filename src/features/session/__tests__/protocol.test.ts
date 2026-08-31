import { describe, expect, it } from 'vitest'

import {
  MAX_CHANNEL_NAME_LENGTH,
  MAX_CHAT_LENGTH,
  MAX_FILE_BYTES,
  MAX_FILE_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_ROSTER_SIZE,
  isValidPeerId,
  parseWireMessage,
  sanitizeName,
  shortId,
  shouldInitiate,
  supersedesChannelName,
} from '../protocol'

describe('isValidPeerId', () => {
  it('accepts the ids the broker actually issues', () => {
    expect(isValidPeerId('sinal-abc23xyz9k7m')).toBe(true)
    expect(isValidPeerId('a_b-C9')).toBe(true)
  })

  it('rejects anything that could smuggle markup or a path', () => {
    expect(isValidPeerId('<img src=x onerror=alert(1)>')).toBe(false)
    expect(isValidPeerId('../../etc/passwd')).toBe(false)
    expect(isValidPeerId('abc')).toBe(false) // too short
    expect(isValidPeerId('x'.repeat(65))).toBe(false)
    expect(isValidPeerId(null)).toBe(false)
    expect(isValidPeerId(42)).toBe(false)
  })
})

describe('parseWireMessage', () => {
  it('drops values that are not messages at all', () => {
    expect(parseWireMessage(null)).toBeNull()
    expect(parseWireMessage('hello')).toBeNull()
    expect(parseWireMessage(7)).toBeNull()
    expect(parseWireMessage({})).toBeNull()
  })

  it('ignores message types it does not know', () => {
    expect(parseWireMessage({ t: 'ban', target: 'someone' })).toBeNull()
    expect(parseWireMessage({ t: 'reboot' })).toBeNull()
  })

  it('coerces missing hello fields instead of trusting them', () => {
    expect(parseWireMessage({ t: 'hello' })).toEqual({
      t: 'hello',
      name: '',
      micMuted: false,
      sharing: false,
      camera: false,
      attention: 'unknown',
      peers: [],
    })
  })

  it('treats screen and camera as independent', () => {
    // Someone can show both at once, so neither flag may be derived from the
    // other — a tile showing a screen must not assume the camera is off.
    expect(parseWireMessage({ t: 'camera', on: true })).toEqual({ t: 'camera', on: true })
    expect(parseWireMessage({ t: 'camera', on: 'sim' })).toEqual({ t: 'camera', on: false })
    const parsed = parseWireMessage({ t: 'hello', sharing: true, camera: true })
    expect(parsed).toMatchObject({ sharing: true, camera: true })
  })

  it('reads an occupant list with names', () => {
    const parsed = parseWireMessage({
      t: 'members',
      occupants: [
        { id: 'sinal-aaaaaaaaaaaa', name: 'Vini' },
        { id: 'sinal-bbbbbbbbbbbb', name: '' },
      ],
    })
    expect(parsed).toEqual({
      t: 'members',
      occupants: [
        { id: 'sinal-aaaaaaaaaaaa', name: 'Vini' },
        { id: 'sinal-bbbbbbbbbbbb', name: '' },
      ],
    })
  })

  it('still reads the bare id list an older build sends', () => {
    // Otherwise a peer that has not reloaded would never be dialled at all.
    expect(parseWireMessage({ t: 'members', peers: ['sinal-aaaaaaaaaaaa'] })).toEqual({
      t: 'members',
      occupants: [{ id: 'sinal-aaaaaaaaaaaa', name: '' }],
    })
  })

  it('drops occupants it could not dial and sanitises their names', () => {
    const parsed = parseWireMessage({
      t: 'members',
      occupants: [
        { id: '<script>', name: 'mau' },
        { name: 'sem id' },
        null,
        { id: 'sinal-aaaaaaaaaaaa', name: 'z'.repeat(80) },
      ],
    })
    expect(parsed).toEqual({
      t: 'members',
      occupants: [{ id: 'sinal-aaaaaaaaaaaa', name: 'z'.repeat(MAX_NAME_LENGTH) }],
    })
  })

  it('keeps only well-formed ids out of a roster', () => {
    const parsed = parseWireMessage({
      t: 'roster',
      peers: ['sinal-aaaaaaaaaaaa', '<script>', 42, null, 'sinal-bbbbbbbbbbbb'],
    })
    expect(parsed).toMatchObject({ peers: ['sinal-aaaaaaaaaaaa', 'sinal-bbbbbbbbbbbb'] })
  })

  it('caps roster size so one peer cannot flood the mesh', () => {
    const peers = Array.from({ length: MAX_ROSTER_SIZE + 20 }, (_, i) =>
      `sinal-${String(i).padStart(12, '0')}`,
    )
    const parsed = parseWireMessage({ t: 'roster', peers })
    expect(parsed?.t).toBe('roster')
    expect(parsed && 'peers' in parsed ? parsed.peers : []).toHaveLength(MAX_ROSTER_SIZE)
  })

  it('truncates names and strips control characters', () => {
    const parsed = parseWireMessage({ t: 'name', name: `  ${'z'.repeat(80)}  ` })
    expect(parsed).toEqual({ t: 'name', name: 'z'.repeat(MAX_NAME_LENGTH) })
  })

  it('treats non-boolean mute flags as unmuted', () => {
    expect(parseWireMessage({ t: 'mic', micMuted: 'yes' })).toEqual({ t: 'mic', micMuted: false })
    expect(parseWireMessage({ t: 'mic', micMuted: true })).toEqual({ t: 'mic', micMuted: true })
  })

  it('carries who claims to be removing someone', () => {
    // The claim travels in the message because a removal can arrive from
    // someone not in the channel, leaving no established peer to name.
    expect(parseWireMessage({ t: 'kick', by: 'PohWay' })).toEqual({ t: 'kick', by: 'PohWay' })
    // Absent from an older build; the receiver falls back to what it holds.
    expect(parseWireMessage({ t: 'kick' })).toEqual({ t: 'kick', by: '' })
  })

  it('refuses a channel answer that is not a usable id', () => {
    // This id gets joined, and joining an empty channel claims it. A malformed
    // value must never reach that path.
    expect(parseWireMessage({ t: 'channel', id: 'sinal-c-abc23xyz9k' })).toEqual({
      t: 'channel',
      id: 'sinal-c-abc23xyz9k',
    })
    expect(parseWireMessage({ t: 'channel', id: '<script>' })).toBeNull()
    expect(parseWireMessage({ t: 'channel' })).toBeNull()
  })

  it('accepts the attention states it knows', () => {
    for (const attention of ['focused', 'visible', 'hidden'] as const) {
      expect(parseWireMessage({ t: 'attention', attention })).toEqual({ t: 'attention', attention })
    }
  })

  it('falls back to unknown for any attention value it does not recognise', () => {
    // A newer build could report a state this version has never heard of.
    // Guessing 'focused' would tell the user someone is watching their screen
    // when we have no idea — 'unknown' renders nothing instead.
    for (const attention of ['watching', '', null, 7, true]) {
      expect(parseWireMessage({ t: 'attention', attention })).toEqual({
        t: 'attention',
        attention: 'unknown',
      })
    }
  })

  it('drops empty chat and clamps long chat', () => {
    expect(parseWireMessage({ t: 'chat', text: '   ' })).toBeNull()
    const parsed = parseWireMessage({ t: 'chat', text: 'a'.repeat(MAX_CHAT_LENGTH + 50), at: 5 })
    expect((parsed as { text: string }).text).toHaveLength(MAX_CHAT_LENGTH)
  })

  it('replaces a non-numeric timestamp rather than propagating NaN', () => {
    expect(parseWireMessage({ t: 'chat', text: 'oi', at: 'agora' })).toEqual({
      t: 'chat',
      text: 'oi',
      at: 0,
    })
  })
})

describe('channel-name messages', () => {
  const base = { t: 'channel-name', name: 'Sala', at: 5, from: 'sinal-aaaaaaaaaaaa' }

  it('accepts a well-formed claim', () => {
    expect(parseWireMessage(base)).toEqual(base)
  })

  it('drops a claim that cannot be ordered against the others', () => {
    // Without both fields there is no way to settle a conflict, and guessing
    // would let two peers keep different names forever.
    expect(parseWireMessage({ ...base, from: undefined })).toBeNull()
    expect(parseWireMessage({ ...base, from: '<script>' })).toBeNull()
    expect(parseWireMessage({ ...base, name: '   ' })).toBeNull()
  })

  it('replaces a non-numeric timestamp rather than propagating NaN', () => {
    expect(parseWireMessage({ ...base, at: 'agora' })).toEqual({ ...base, at: 0 })
  })

  it('clamps a name long enough to break the layout', () => {
    const parsed = parseWireMessage({ ...base, name: 'z'.repeat(200) })
    expect((parsed as { name: string }).name).toHaveLength(MAX_CHANNEL_NAME_LENGTH)
  })
})

describe('supersedesChannelName', () => {
  const older = { at: 10, from: 'sinal-bbbbbbbbbbbb' }

  it('prefers the later claim', () => {
    expect(supersedesChannelName({ at: 11, from: 'sinal-aaaaaaaaaaaa' }, older)).toBe(true)
    expect(supersedesChannelName({ at: 9, from: 'sinal-zzzzzzzzzzzz' }, older)).toBe(false)
  })

  it('settles a tie by peer id, the same way on every node', () => {
    const a = { at: 10, from: 'sinal-aaaaaaaaaaaa' }
    const z = { at: 10, from: 'sinal-zzzzzzzzzzzz' }
    // Exactly one direction wins, so two peers renaming in the same instant
    // converge instead of each keeping whatever arrived last.
    expect(supersedesChannelName(z, a)).toBe(true)
    expect(supersedesChannelName(a, z)).toBe(false)
  })

  it('does not supersede itself, so a rebroadcast is a no-op', () => {
    expect(supersedesChannelName(older, older)).toBe(false)
  })
})

describe('shouldInitiate', () => {
  it('picks exactly one side of every pair', () => {
    const a = 'sinal-aaaaaaaaaaaa'
    const b = 'sinal-bbbbbbbbbbbb'
    expect(shouldInitiate(a, b)).toBe(true)
    expect(shouldInitiate(b, a)).toBe(false)
    // The invariant that prevents duplicate calls: never both, never neither.
    expect(shouldInitiate(a, b)).not.toBe(shouldInitiate(b, a))
  })
})

describe('shortId', () => {
  it('shortens long ids and leaves small ones alone', () => {
    expect(shortId('sinal-abc23xyz')).toBe('sina…xyz')
    expect(shortId('abcd')).toBe('abcd')
  })
})

describe('sanitizeName', () => {
  it('returns an empty string for anything that is not text', () => {
    expect(sanitizeName(undefined)).toBe('')
    expect(sanitizeName({ toString: () => 'x' })).toBe('')
  })
})

describe('mensagens de fala', () => {
  it('só aceita o booleano, sem inventar a partir de outra coisa', () => {
    // A tile lighting up because a peer sent the string "yes" would be the app
    // asserting who is talking on evidence it does not have.
    expect(parseWireMessage({ t: 'speaking', speaking: true })).toEqual({
      t: 'speaking',
      speaking: true,
    })
    expect(parseWireMessage({ t: 'speaking', speaking: 'sim' })).toEqual({
      t: 'speaking',
      speaking: false,
    })
    expect(parseWireMessage({ t: 'speaking' })).toEqual({ t: 'speaking', speaking: false })
  })
})

describe('mensagens de arquivo', () => {
  const bytes = new TextEncoder().encode('conteúdo').buffer

  it('aceita bytes e confia no que chegou, não no tamanho declarado', () => {
    const parsed = parseWireMessage({
      t: 'file',
      name: 'notas.txt',
      // A sender claiming a different size proves nothing; the buffer does.
      size: 999999,
      at: 5,
      data: bytes,
    })
    expect(parsed).toMatchObject({
      t: 'file',
      name: 'notas.txt',
      size: bytes.byteLength,
      at: 5,
    })
  })

  it('aceita os bytes remontados de um arquivo grande, não só os de um pequeno', () => {
    // PeerJS hands the two sizes over differently: a payload that fits one
    // datagram arrives as an ArrayBuffer, while a chunked one is reassembled
    // into a Uint8Array. Accepting only the first shape dropped every file
    // above ~16 KB, and no fixture small enough to be convenient could show it.
    const view = new Uint8Array([1, 2, 3, 4])
    const parsed = parseWireMessage({ t: 'file', name: 'grande.bin', at: 9, data: view })
    expect(parsed).toMatchObject({ t: 'file', name: 'grande.bin', size: 4, at: 9 })
    expect([...(parsed as { data: Uint8Array }).data]).toEqual([1, 2, 3, 4])
  })

  it('recusa qualquer coisa que não sejam bytes de verdade', () => {
    // A string arriving under a file's name would be turned into a blob and
    // offered as a download — the one place where trusting the shape matters.
    expect(parseWireMessage({ t: 'file', name: 'x', data: 'não sou bytes' })).toBeNull()
    expect(parseWireMessage({ t: 'file', name: 'x', data: null })).toBeNull()
    expect(parseWireMessage({ t: 'file', name: 'x' })).toBeNull()
    expect(parseWireMessage({ t: 'file', name: 'x', data: new ArrayBuffer(0) })).toBeNull()
  })

  it('recusa um arquivo acima do teto, que ambos os lados guardam na memória', () => {
    const huge = new ArrayBuffer(MAX_FILE_BYTES + 1)
    expect(parseWireMessage({ t: 'file', name: 'grande', data: huge })).toBeNull()
  })

  it('dá um nome a um arquivo que chega sem nenhum, e corta os longos', () => {
    expect(parseWireMessage({ t: 'file', data: bytes })).toMatchObject({ name: 'arquivo' })
    const long = parseWireMessage({ t: 'file', name: 'z'.repeat(200), data: bytes })
    expect((long as { name: string }).name).toHaveLength(MAX_FILE_NAME_LENGTH)
  })
})
