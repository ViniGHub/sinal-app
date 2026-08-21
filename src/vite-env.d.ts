/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Safari still ships the prefixed constructor. */
    webkitAudioContext?: typeof AudioContext
  }
}

export {}
