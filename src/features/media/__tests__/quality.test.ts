import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SCREEN_QUALITY,
  SCREEN_QUALITIES,
  findScreenQuality,
} from '../quality'

describe('findScreenQuality', () => {
  it('finds every preset by id', () => {
    for (const quality of SCREEN_QUALITIES) {
      expect(findScreenQuality(quality.id).id).toBe(quality.id)
    }
  })

  it('falls back to the default for anything it does not know', () => {
    // A stored value can be from an older build, hand-edited, or absent.
    // Guessing wrong here would silently change how someone's screen looks.
    expect(findScreenQuality(null).id).toBe(DEFAULT_SCREEN_QUALITY)
    expect(findScreenQuality(undefined).id).toBe(DEFAULT_SCREEN_QUALITY)
    expect(findScreenQuality('ultra').id).toBe(DEFAULT_SCREEN_QUALITY)
  })
})

describe('os presets', () => {
  it('trocam nitidez por fluidez, e não uma escada de "melhor"', () => {
    const sharp = findScreenQuality('nitida')
    const smooth = findScreenQuality('fluida')

    // The whole point of presets: more frames costs bits per frame. If both
    // moved in the same direction there would be nothing to choose between.
    expect(smooth.frameRate).toBeGreaterThan(sharp.frameRate)
    expect(sharp.contentHint).toBe('text')
    expect(smooth.contentHint).toBe('motion')
  })

  it('só a econômica reduz a resolução transmitida', () => {
    for (const quality of SCREEN_QUALITIES) {
      if (quality.id === 'economica') expect(quality.scaleDownBy).toBeGreaterThan(1)
      else expect(quality.scaleDownBy).toBe(1)
    }
  })

  it('a econômica é a mais barata em todos os eixos', () => {
    const cheap = findScreenQuality('economica')
    for (const quality of SCREEN_QUALITIES) {
      expect(cheap.maxBitrate).toBeLessThanOrEqual(quality.maxBitrate)
    }
  })

  it('nenhum preset deixa o teto de banda em aberto', () => {
    // An unset ceiling lets a busy screen saturate the link — and on a relayed
    // call, bytes are billed bandwidth.
    for (const quality of SCREEN_QUALITIES) {
      expect(quality.maxBitrate).toBeGreaterThan(0)
      expect(quality.frameRate).toBeGreaterThan(0)
    }
  })
})
