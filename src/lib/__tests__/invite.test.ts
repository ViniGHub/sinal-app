import { describe, expect, it } from 'vitest'

import { buildInviteUrl, readInvite } from '../invite'

const ID = 'sinal-abc23xyz9k7m'

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

describe('readInvite', () => {
  it('reads back what buildInviteUrl wrote', () => {
    expect(readInvite(`#join=${ID}`)).toBe(ID)
  })

  it('returns null when there is no invite', () => {
    expect(readInvite('')).toBeNull()
    expect(readInvite('#outra-coisa')).toBeNull()
  })

  it('refuses a fragment carrying something that is not a peer id', () => {
    expect(readInvite('#join=%3Cscript%3E')).toBeNull()
    expect(readInvite('#join=%E0%A4%A')).toBeNull() // malformed percent-encoding
  })
})
