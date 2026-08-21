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

/**
 * `ideal` rather than `exact` for the device: a remembered id can point at
 * hardware that has since been unplugged, and we would rather fall back to the
 * default microphone than fail to capture anything at all.
 */
function micConstraints(deviceId: string | null): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    },
    video: false,
  }
}

function cameraConstraints(deviceId: string | null): MediaStreamConstraints {
  return {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...(deviceId ? { deviceId: { ideal: deviceId } } : { facingMode: 'user' }),
    },
    // The microphone is captured separately and already flows on its own call;
    // asking for audio here would send everyone a second copy of your voice.
    audio: false,
  }
}

function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')
}

export async function acquireMicrophone(deviceId: string | null = null): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MediaError('Este navegador não expõe acesso ao microfone.', false)
  }
  try {
    return await navigator.mediaDevices.getUserMedia(micConstraints(deviceId))
  } catch (error) {
    if (isCancellation(error)) {
      throw new MediaError('Permissão de microfone negada — você entrou apenas como ouvinte.', true)
    }
    throw new MediaError('Nenhum microfone disponível — você entrou apenas como ouvinte.', false)
  }
}

export async function acquireCamera(deviceId: string | null = null): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MediaError('Este navegador não expõe acesso à câmera.', false)
  }
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId))
  } catch (error) {
    if (isCancellation(error)) {
      throw new MediaError('Permissão de câmera negada.', true)
    }
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      throw new MediaError('Nenhuma câmera encontrada neste dispositivo.', false)
    }
    // NotReadableError, most often: another app already holds the device.
    throw new MediaError('Não foi possível abrir a câmera — outro app pode estar usando.', false)
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
