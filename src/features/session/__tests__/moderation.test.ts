import { describe, expect, it } from 'vitest'

import { isAdminName } from '../moderation'

describe('isAdminName', () => {
  it('recognises the admin however it was typed', () => {
    expect(isAdminName('PohWay')).toBe(true)
    expect(isAdminName('pohway')).toBe(true)
    expect(isAdminName('POHWAY')).toBe(true)
    expect(isAdminName('  PohWay  ')).toBe(true)
  })

  it('does not match names that merely contain it', () => {
    expect(isAdminName('PohWay2')).toBe(false)
    expect(isAdminName('not PohWay')).toBe(false)
    expect(isAdminName('Poh Way')).toBe(false)
    expect(isAdminName('')).toBe(false)
  })

  it('is a convention, and the test says so out loud', () => {
    // Anyone can type this name and gain the button — display names are
    // self-declared and travel unverified. This asserts the mechanism, not
    // that moderation is enforced, because it is not.
    expect(isAdminName('PohWay')).toBe(true)
  })
})
