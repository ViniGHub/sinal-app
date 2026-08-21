/**
 * Thin wrappers over getUserMedia/getDisplayMedia. Keeping them here means the
 * session core has no direct dependency on browser capture APIs, which is what
 * makes it testable.
 */

export class MediaError extends Error {
  constructor(
    message: string,
    /** True when the user dismissed the prompt rather than hitting a fault. */
    readonly cancelled: boolean,
  ) {
    super(message)
    this.name = 'MediaError'
  }
}

const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: false,
}

function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')
}

export async function acquireMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MediaError('Este navegador não expõe acesso ao microfone.', false)
  }
  try {
    return await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
  } catch (error) {
    if (isCancellation(error)) {
      throw new MediaError('Permissão de microfone negada — você entrou apenas como ouvinte.', true)
    }
    throw new MediaError('Nenhum microfone disponível — você entrou apenas como ouvinte.', false)
  }
}

export async function acquireScreen(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new MediaError('Este navegador não permite compartilhar a tela.', false)
  }
  try {
    // Audio is best-effort: only Chromium shares tab audio, others ignore it.
    return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  } catch (error) {
    throw new MediaError('Compartilhamento cancelado.', isCancellation(error))
  }
}

/**
 * A track of silence.
 *
 * `peer.call()` needs an outgoing stream to open a connection, so a listener
 * with no microphone would be unable to dial anyone. Sending silence lets them
 * join and hear the room; the muted flag tells the others why they are quiet.
 */
export function createSilentAudioStream(): MediaStream {
  const AudioCtor = window.AudioContext ?? window.webkitAudioContext
  if (!AudioCtor) return new MediaStream()
  const ctx = new AudioCtor()
  const oscillator = ctx.createOscillator()
  const destination = ctx.createMediaStreamDestination()
  const gain = ctx.createGain()
  gain.gain.value = 0
  oscillator.connect(gain).connect(destination)
  oscillator.start()
  const track = destination.stream.getAudioTracks()[0]
  if (track) track.enabled = false
  return destination.stream
}

/** Stops every track so the browser drops its camera/screen/mic indicator. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop())
}
