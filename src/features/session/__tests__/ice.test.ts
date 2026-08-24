import { describe, expect, it } from 'vitest'

import {
  buildIceServers,
  buildPeerConfig,
  hasCustomIceConfig,
  hasTurn,
  parseIceServers,
} from '../ice'

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

describe('parseIceServers', () => {
  it('reads the shape the credential endpoint returns', () => {
    expect(
      parseIceServers({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478'] },
          {
            urls: ['turns:turn.cloudflare.com:443?transport=tcp'],
            username: 'abc',
            credential: 'def',
          },
        ],
      }),
    ).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'abc', credential: 'def' },
    ])
  })

  it('accepts a single url given as a string', () => {
    expect(parseIceServers({ iceServers: [{ urls: 'stun:stun.exemplo.dev:3478' }] })).toEqual([
      { urls: ['stun:stun.exemplo.dev:3478'] },
    ])
  })

  it('drops a half-credentialled entry down to a bare url', () => {
    // Keeping username without credential would make the browser attempt it,
    // fail to authenticate, and slow every connection down.
    expect(parseIceServers({ iceServers: [{ urls: ['turn:x.dev:3478'], username: 'só-isso' }] }))
      .toEqual([{ urls: ['turn:x.dev:3478'] }])
  })

  it('returns nothing for a response that is not one', () => {
    // A proxy or a misconfigured deploy can answer anything at all.
    expect(parseIceServers(null)).toEqual([])
    expect(parseIceServers('erro')).toEqual([])
    expect(parseIceServers({})).toEqual([])
    expect(parseIceServers({ iceServers: 'nope' })).toEqual([])
    expect(parseIceServers({ iceServers: [null, 42, { urls: [] }, {}] })).toEqual([])
  })
})

describe('hasTurn', () => {
  it('reports whether a relay is actually available', () => {
    expect(hasTurn({})).toBe(false)
    expect(hasTurn(TURN)).toBe(true)
  })
})
