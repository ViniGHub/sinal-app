/**
 * Mints short-lived TURN credentials for the browser.
 *
 * The whole reason this exists: anything the front-end can read, everyone can
 * read. A permanent TURN password shipped in the bundle is a public password —
 * open the DevTools, copy it, spend someone else's quota. So the key stays
 * here, and the page only ever receives credentials that expire.
 *
 * Deployed with `npx wrangler deploy` from this directory. See the README.
 */

/** Two hours: comfortably longer than a call, short enough to be worth little. */
const TTL_SECONDS = 7200

const CLOUDFLARE_API = 'https://rtc.live.cloudflare.com/v1/turn/keys'

/**
 * Only answers browsers on origins we know about.
 *
 * Without this the endpoint is an open faucet: anyone could point their own app
 * at it and drain the quota. It is not authentication — Origin is set by the
 * browser and a script elsewhere can omit it — but it stops the casual case,
 * which is the one that actually happens.
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') ?? ''
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (!allowed.includes(origin)) return null

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Credentials are per-caller and expire; caching them anywhere would
      // hand the same pair to everyone.
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)
    if (!cors) return new Response('Origem não autorizada.', { status: 403 })

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors)

    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
      return json({ error: 'worker_not_configured' }, 500, cors)
    }

    let upstream
    try {
      upstream = await fetch(
        `${CLOUDFLARE_API}/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: TTL_SECONDS }),
        },
      )
    } catch {
      return json({ error: 'upstream_unreachable' }, 502, cors)
    }

    if (!upstream.ok) {
      // The status is echoed so a misconfigured key reads as 401 rather than
      // as a generic failure the caller cannot act on.
      return json({ error: 'upstream_failed', status: upstream.status }, 502, cors)
    }

    const payload = await upstream.json()
    if (!Array.isArray(payload?.iceServers)) {
      return json({ error: 'unexpected_upstream_shape' }, 502, cors)
    }

    return json({ iceServers: payload.iceServers, ttl: TTL_SECONDS }, 200, cors)
  },
}
