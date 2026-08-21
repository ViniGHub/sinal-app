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

export interface IceEnv {
  readonly VITE_STUN_URLS?: string | undefined
  readonly VITE_TURN_URLS?: string | undefined
  readonly VITE_TURN_USERNAME?: string | undefined
  readonly VITE_TURN_CREDENTIAL?: string | undefined
  readonly VITE_ICE_FORCE_RELAY?: string | undefined
}

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

/**
 * The object handed to `new Peer(id, { config })`.
 *
 * Set `VITE_ICE_FORCE_RELAY=true` to make the browser refuse direct paths and
 * use TURN only. Nothing connects unless the relay works, which is the quickest
 * way to prove a TURN server is actually configured correctly — never ship it.
 */
export function buildPeerConfig(env: IceEnv): RTCConfiguration {
  const config: RTCConfiguration = { iceServers: buildIceServers(env) }
  if (env.VITE_ICE_FORCE_RELAY === 'true') config.iceTransportPolicy = 'relay'
  return config
}

/** True when a usable TURN server was configured, for surfacing in the UI. */
export function hasTurn(env: IceEnv): boolean {
  return buildIceServers(env).some((server) => 'username' in server)
}
