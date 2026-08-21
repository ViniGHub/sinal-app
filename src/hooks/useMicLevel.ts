import { useEffect, useState } from 'react'

/** Bars in the meter — the level is quantised to these to bound re-renders. */
const STEPS = 12

/** Roughly the loudness of normal speech, used to normalise the reading. */
const SPEECH_REFERENCE = 90

/**
 * Reports microphone loudness as a value from 0 to 1.
 *
 * The raw analyser runs at frame rate, but React only re-renders when the
 * quantised step changes, so a steady voice does not cause 60 updates a second.
 */
export function useMicLevel(stream: MediaStream | null, muted: boolean): number {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    if (!stream || muted) {
      setLevel(0)
      return
    }

    const AudioCtor = window.AudioContext ?? window.webkitAudioContext
    if (!AudioCtor) return

    let context: AudioContext
    try {
      context = new AudioCtor()
    } catch {
      return // The meter is decorative; never break the app over it.
    }

    const analyser = context.createAnalyser()
    analyser.fftSize = 64
    analyser.smoothingTimeConstant = 0.6
    context.createMediaStreamSource(stream).connect(analyser)

    const bins = new Uint8Array(analyser.frequencyBinCount)
    let frame = 0
    let lastStep = -1

    const tick = () => {
      analyser.getByteFrequencyData(bins)
      let total = 0
      for (const value of bins) total += value
      const normalised = Math.min(1, total / bins.length / SPEECH_REFERENCE)

      const step = Math.round(normalised * STEPS)
      if (step !== lastStep) {
        lastStep = step
        setLevel(step / STEPS)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    // Browsers start an AudioContext suspended until the page has been
    // interacted with, which is why the original meter often sat dead on load.
    const resume = () => void context.resume().catch(() => {})
    resume()
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      void context.close().catch(() => {})
    }
  }, [stream, muted])

  return level
}
