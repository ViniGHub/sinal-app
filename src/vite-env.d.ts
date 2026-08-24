/// <reference types="vite/client" />

declare global {
  /**
   * Build-time configuration. Vite inlines anything prefixed with VITE_ into
   * the bundle, so these values are public by definition — see the TURN note in
   * the README before putting a long-lived credential here.
   *
   * This augments the interface Vite already declares, which is why it has to
   * sit inside `declare global` rather than at module scope.
   */
  interface ImportMetaEnv {
    /**
     * Endpoint that mints short-lived TURN credentials (the Cloudflare Worker
     * in `worker/`). Preferred over the static fields below, because only
     * credentials that expire are safe to hand to a browser. Just a URL, so it
     * is fine that this one is public.
     */
    readonly VITE_TURN_ENDPOINT?: string
    /** STUN servers, comma-separated. Defaults to Google's public ones. */
    readonly VITE_STUN_URLS?: string
    /** TURN servers, comma-separated. Ignored unless both fields below are set. */
    readonly VITE_TURN_URLS?: string
    readonly VITE_TURN_USERNAME?: string
    readonly VITE_TURN_CREDENTIAL?: string
    /** 'true' forces every connection through TURN. Testing only. */
    readonly VITE_ICE_FORCE_RELAY?: string
  }

  interface Window {
    /** Safari still ships the prefixed constructor. */
    webkitAudioContext?: typeof AudioContext
  }
}

export {}
