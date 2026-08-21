import { describe, expect, it } from 'vitest'

import { buildIceServers, buildPeerConfig, hasCustomIceConfig, hasTurn } from '../ice'

const TURN = {
  VITE_TURN_URLS: 'turn:turn.exemplo.dev:3478',
  VITE_TURN_USERNAME: 'vini',
  VITE_TURN_CREDENTIAL: 'segredo',
}

describe('buildIceServers', () => {
  it('falls back to public STUN when nothing is configured', () => {
    const servers = buildIceServers({})
    expect(servers).toHaveLength(1)
    expect(servers[0]?.urls).toEqual([
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ])
  })

  it('adds TURN when url and both credentials are present', () => {
    const servers = buildIceServers(TURN)
    expect(servers).toHaveLength(2)
    expect(servers[1]).toEqual({
      urls: ['turn:turn.exemplo.dev:3478'],
      username: 'vini',
      credential: 'segredo',
    })
  })

  it('skips a half-configured TURN rather than sending one that cannot auth', () => {
    expect(buildIceServers({ VITE_TURN_URLS: TURN.VITE_TURN_URLS })).toHaveLength(1)
    expect(
      buildIceServers({ ...TURN, VITE_TURN_CREDENTIAL: '   ' }),
    ).toHaveLength(1)
  })

  it('splits lists on commas and whitespace alike', () => {
    const servers = buildIceServers({
      ...TURN,
      VITE_TURN_URLS: 'turn:a.dev:3478, turn:b.dev:3478\nturns:c.dev:5349',
    })
    expect(servers[1]?.urls).toEqual(['turn:a.dev:3478', 'turn:b.dev:3478', 'turns:c.dev:5349'])
  })

  it('lets custom STUN replace the defaults', () => {
    const servers = buildIceServers({ VITE_STUN_URLS: 'stun:stun.exemplo.dev:3478' })
    expect(servers[0]?.urls).toEqual(['stun:stun.exemplo.dev:3478'])
  })
})

describe('buildPeerConfig', () => {
  it('returns undefined when nothing is configured', () => {
    // Regression guard. Supplying `config` replaces PeerJS's DEFAULT_CONFIG
    // wholesale, and that default carries a free community TURN relay. An
    // unconfigured build must leave it alone rather than downgrade to
    // STUN-only, which is strictly worse at NAT traversal.
    expect(buildPeerConfig({})).toBeUndefined()
  })

  it('builds a config as soon as anything is configured', () => {
    expect(buildPeerConfig(TURN)).toBeDefined()
    expect(buildPeerConfig({ VITE_STUN_URLS: 'stun:stun.exemplo.dev:3478' })).toBeDefined()
    expect(buildPeerConfig({ VITE_ICE_FORCE_RELAY: 'true' })).toBeDefined()
  })

  it('leaves the transport policy alone by default', () => {
    expect(buildPeerConfig(TURN)?.iceTransportPolicy).toBeUndefined()
  })

  it('forces relay only for the exact opt-in string', () => {
    expect(buildPeerConfig({ ...TURN, VITE_ICE_FORCE_RELAY: 'true' })?.iceTransportPolicy).toBe(
      'relay',
    )
    expect(buildPeerConfig({ ...TURN, VITE_ICE_FORCE_RELAY: '1' })?.iceTransportPolicy)
      .toBeUndefined()
  })
})

describe('hasCustomIceConfig', () => {
  it('is false only when the environment asks for nothing', () => {
    expect(hasCustomIceConfig({})).toBe(false)
    expect(hasCustomIceConfig({ VITE_TURN_URLS: 'turn:x.dev:3478' })).toBe(false) // sem credenciais
    expect(hasCustomIceConfig(TURN)).toBe(true)
  })
})

describe('hasTurn', () => {
  it('reports whether a relay is actually available', () => {
    expect(hasTurn({})).toBe(false)
    expect(hasTurn(TURN)).toBe(true)
  })
})
