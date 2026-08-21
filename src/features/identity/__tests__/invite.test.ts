import { describe, expect, it } from 'vitest'

import { buildChannelInviteUrl, buildInviteUrl, extractInviteId, readInvite } from '../invite'

const ID = 'sinal-abc23xyz9k7m'
const CHANNEL = 'sinal-c-abc23xyz9k'

describe('buildInviteUrl', () => {
  it('appends the id as a fragment so it never reaches the host', () => {
    expect(buildInviteUrl(ID, 'https://exemplo.dev/sinal/')).toBe(
      `https://exemplo.dev/sinal/#join=${ID}`,
    )
  })

  it('replaces an existing fragment instead of stacking another one', () => {
    expect(buildInviteUrl(ID, 'https://exemplo.dev/#join=outro')).toBe(
      `https://exemplo.dev/#join=${ID}`,
    )
  })
})

describe('buildChannelInviteUrl', () => {
  it('uses a distinct prefix so the reader knows how to act on it', () => {
    expect(buildChannelInviteUrl(CHANNEL, 'https://exemplo.dev/')).toBe(
      `https://exemplo.dev/#channel=${CHANNEL}`,
    )
  })
})

describe('extractInviteId', () => {
  it('accepts a full link of either kind', () => {
    expect(extractInviteId(`https://exemplo.dev/#join=${ID}`)).toBe(ID)
    expect(extractInviteId(`https://exemplo.dev/#channel=${CHANNEL}`)).toBe(CHANNEL)
  })

  it('accepts a bare id, which is what people usually paste', () => {
    expect(extractInviteId(`  ${CHANNEL}  `)).toBe(CHANNEL)
    expect(extractInviteId(ID)).toBe(ID)
  })

  it('returns null for text that carries no usable id', () => {
    expect(extractInviteId('')).toBeNull()
    expect(extractInviteId('   ')).toBeNull()
    expect(extractInviteId('https://exemplo.dev/')).toBeNull()
    expect(extractInviteId('https://exemplo.dev/#join=<script>')).toBeNull()
    expect(extractInviteId('bom dia')).toBeNull()
  })
})

describe('readInvite', () => {
  it('round-trips a peer invite', () => {
    expect(readInvite(`#join=${ID}`)).toEqual({ kind: 'peer', id: ID })
  })

  it('round-trips a channel invite', () => {
    expect(readInvite(`#channel=${CHANNEL}`)).toEqual({ kind: 'channel', id: CHANNEL })
  })

  it('returns null when there is no invite', () => {
    expect(readInvite('')).toBeNull()
    expect(readInvite('#outra-coisa')).toBeNull()
  })

  it('refuses a fragment carrying something that is not an id', () => {
    expect(readInvite('#join=%3Cscript%3E')).toBeNull()
    expect(readInvite('#channel=%3Cscript%3E')).toBeNull()
    expect(readInvite('#join=%E0%A4%A')).toBeNull() // malformed percent-encoding
  })
})
