/**
 * ICE server configuration.
 *
 * WebRTC needs help to find a path between two machines behind routers:
 *
 * - **STUN** just tells a peer what its public address looks like from the
 *   outside. It is cheap, and enough for most home connections.
 * - **TURN** relays the actual media when no direct path exists — the case for
 *   symmetric NAT, restrictive corporate firewalls and some mobile carriers.
 *   It costs real bandwidth, because every byte passes through your server.
 *
 * PeerJS falls back to Google's public STUN when given no config at all. The
 * moment we pass `config`, that default is replaced wholesale, so the STUN
 * entries below have to be restated rather than assumed.
 */

import { diagnostics } from '@/shared/diagnostics'

export interface IceEnv {
  /** Endpoint that mints short-lived credentials. Preferred over the fields below. */
  readonly VITE_TURN_ENDPOINT?: string | undefined
  readonly VITE_STUN_URLS?: string | undefined
  readonly VITE_TURN_URLS?: string | undefined
  readonly VITE_TURN_USERNAME?: string | undefined
  readonly VITE_TURN_CREDENTIAL?: string | undefined
  readonly VITE_ICE_FORCE_RELAY?: string | undefined
}

/** Long enough to fail fast; the app still works without TURN, just less often. */
const ENDPOINT_TIMEOUT_MS = 5_000

const DEFAULT_STUN = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
]

/** Accepts a comma- or whitespace-separated list, as env vars tend to carry. */
function splitUrls(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,\s]+/)
    .map((url) => url.trim())
    .filter(Boolean)
}

export function buildIceServers(env: IceEnv): RTCIceServer[] {
  const stunUrls = splitUrls(env.VITE_STUN_URLS)
  const servers: RTCIceServer[] = [{ urls: stunUrls.length ? stunUrls : DEFAULT_STUN }]

  const turnUrls = splitUrls(env.VITE_TURN_URLS)
  const username = env.VITE_TURN_USERNAME?.trim()
  const credential = env.VITE_TURN_CREDENTIAL?.trim()

  // A TURN entry missing its credentials is worse than no entry: the browser
  // still tries it, fails to authenticate, and slows every connection down.
  if (turnUrls.length && username && credential) {
    servers.push({ urls: turnUrls, username, credential })
  }

  return servers
}

/** Whether the environment asks for anything other than PeerJS's defaults. */
export function hasCustomIceConfig(env: IceEnv): boolean {
  return (
    splitUrls(env.VITE_STUN_URLS).length > 0 ||
    hasTurn(env) ||
    env.VITE_ICE_FORCE_RELAY === 'true'
  )
}

/**
 * The object handed to `new Peer(id, { config })`, or undefined to leave
 * PeerJS's own defaults alone.
 *
 * That distinction matters. PeerJS ships a DEFAULT_CONFIG carrying both Google
 * STUN and a free community TURN (`turn:eu-0.turn.peerjs.com`), and supplying
 * `config` replaces it wholesale rather than merging. Returning undefined when
 * nothing is configured keeps that free relay in place instead of silently
 * downgrading every user to STUN-only.
 *
 * Set `VITE_ICE_FORCE_RELAY=true` to make the browser refuse direct paths and
 * use TURN only. Nothing connects unless the relay works, which is the quickest
 * way to prove a TURN server is actually configured correctly — never ship it.
 */
export function buildPeerConfig(env: IceEnv): RTCConfiguration | undefined {
  if (!hasCustomIceConfig(env)) return undefined

  const config: RTCConfiguration = { iceServers: buildIceServers(env) }
  if (env.VITE_ICE_FORCE_RELAY === 'true') config.iceTransportPolicy = 'relay'
  return config
}

/** True when a usable TURN server was configured, for surfacing in the UI. */
export function hasTurn(env: IceEnv): boolean {
  return buildIceServers(env).some((server) => 'username' in server)
}

/**
 * Turns whatever the credential endpoint answered into ICE servers.
 *
 * Validated rather than trusted: it is our own worker, but a misconfigured
 * deploy or a proxy in the way can return anything, and a malformed entry makes
 * the browser fail every connection attempt against it.
 */
export function parseIceServers(payload: unknown): RTCIceServer[] {
  if (typeof payload !== 'object' || payload === null) return []
  const list = (payload as { iceServers?: unknown }).iceServers
  if (!Array.isArray(list)) return []

  const servers: RTCIceServer[] = []
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>

    const urls =
      typeof record['urls'] === 'string'
        ? [record['urls']]
        : Array.isArray(record['urls'])
          ? record['urls'].filter((url): url is string => typeof url === 'string')
          : []
    if (urls.length === 0) continue

    const username = record['username']
    const credential = record['credential']
    // A TURN entry missing its credentials is worse than no entry: the browser
    // still tries it, fails to authenticate, and slows every connection down.
    if (typeof username === 'string' && typeof credential === 'string') {
      servers.push({ urls, username, credential })
    } else {
      servers.push({ urls })
    }
  }
  return servers
}

/**
 * The config to hand PeerJS, resolved once at startup.
 *
 * Prefers the credential endpoint, because credentials that expire are the only
 * kind safe to put in a browser. Falls back to the build-time fields, and then
 * to PeerJS's own defaults — the call is worth attempting without TURN, so a
 * fetch failure must never be fatal.
 */
export async function resolveIceConfig(env: IceEnv): Promise<RTCConfiguration | undefined> {
  const endpoint = env.VITE_TURN_ENDPOINT?.trim()
  if (!endpoint) return buildPeerConfig(env)

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`status ${response.status}`)

    const servers = parseIceServers(await response.json())
    if (servers.length === 0) throw new Error('resposta sem servidores')

    diagnostics.info('ice', `${servers.length} servidor(es) recebidos do endpoint`)
    const config: RTCConfiguration = { iceServers: servers }
    if (env.VITE_ICE_FORCE_RELAY === 'true') config.iceTransportPolicy = 'relay'
    return config
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'desconhecido'
    diagnostics.warn('ice', `endpoint de TURN falhou (${reason}); usando o padrão`)
    return buildPeerConfig(env)
  }
}
