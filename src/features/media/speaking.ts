/**
 * Detects whether the microphone is picking up speech.
 *
 * A raw threshold on loudness flickers badly: ordinary speech dips below any
 * line you pick, several times a second, between words and syllables. So the
 * level to *start* speaking is higher than the level to stop, and a short hold
 * keeps the state up across those dips. The result is a signal a person can
 * read, rather than a light that strobes while someone talks.
 */

/** Loud enough to call it speech. */
const START_LEVEL = 0.16

/** Quiet enough to call it silence — deliberately lower than START. */
const STOP_LEVEL = 0.08

/** How long silence must last before the state drops. */
const HOLD_MS = 400

/** Roughly the loudness of normal speech, used to normalise the reading. */
const SPEECH_REFERENCE = 90

const SAMPLE_MS = 100

export function watchSpeaking(
  stream: MediaStream,
  onChange: (speaking: boolean) => void,
): () => void {
  const AudioCtor = window.AudioContext ?? window.webkitAudioContext
  if (!AudioCtor) return () => {}

  let context: AudioContext
  try {
    context = new AudioCtor()
  } catch {
    // Never worth breaking a call over: without this the tiles simply do not
    // light up.
    return () => {}
  }

  const analyser = context.createAnalyser()
  analyser.fftSize = 64
  analyser.smoothingTimeConstant = 0.5
  context.createMediaStreamSource(stream).connect(analyser)

  const bins = new Uint8Array(analyser.frequencyBinCount)
  let speaking = false
  let quietSince = 0

  const tick = () => {
    analyser.getByteFrequencyData(bins)
    let total = 0
    for (const value of bins) total += value
    const level = Math.min(1, total / bins.length / SPEECH_REFERENCE)

    if (!speaking && level >= START_LEVEL) {
      speaking = true
      quietSince = 0
      onChange(true)
      return
    }
    if (speaking) {
      if (level > STOP_LEVEL) {
        quietSince = 0
        return
      }
      if (quietSince === 0) quietSince = Date.now()
      else if (Date.now() - quietSince >= HOLD_MS) {
        speaking = false
        quietSince = 0
        onChange(false)
      }
    }
  }

  const timer = setInterval(tick, SAMPLE_MS)
  // Browsers start an AudioContext suspended until the page has been
  // interacted with, the same reason the level meter needed nudging.
  const resume = () => void context.resume().catch(() => {})
  resume()
  window.addEventListener('pointerdown', resume)
  window.addEventListener('keydown', resume)

  return () => {
    clearInterval(timer)
    window.removeEventListener('pointerdown', resume)
    window.removeEventListener('keydown', resume)
    void context.close().catch(() => {})
  }
}
