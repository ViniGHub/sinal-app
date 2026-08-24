import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_ENTRIES, diagnostics, formatAt } from '../diagnostics'

describe('diagnostics log', () => {
  beforeEach(() => {
    diagnostics.clear()
  })

  it('records in the order things happened', () => {
    diagnostics.info('peer', 'primeiro')
    diagnostics.warn('canal', 'segundo')
    diagnostics.error('mídia', 'terceiro')

    expect(diagnostics.getSnapshot().map((entry) => entry.message)).toEqual([
      'primeiro',
      'segundo',
      'terceiro',
    ])
    expect(diagnostics.getSnapshot().map((entry) => entry.level)).toEqual([
      'info',
      'warn',
      'error',
    ])
  })

  it('drops the oldest entries instead of growing without bound', () => {
    for (let i = 0; i < MAX_ENTRIES + 50; i += 1) diagnostics.info('peer', `evento ${i}`)

    const entries = diagnostics.getSnapshot()
    expect(entries).toHaveLength(MAX_ENTRIES)
    // The tail is what matters when diagnosing: the most recent events survive.
    expect(entries[entries.length - 1]?.message).toBe(`evento ${MAX_ENTRIES + 49}`)
    expect(entries[0]?.message).toBe('evento 50')
  })

  it('hands out a new snapshot only when something was recorded', () => {
    const before = diagnostics.getSnapshot()
    expect(diagnostics.getSnapshot()).toBe(before)

    diagnostics.info('peer', 'algo')
    // A changed reference is what tells useSyncExternalStore to re-render.
    expect(diagnostics.getSnapshot()).not.toBe(before)
  })

  it('notifies subscribers and stops after unsubscribing', () => {
    const listener = vi.fn()
    const unsubscribe = diagnostics.subscribe(listener)

    diagnostics.info('peer', 'um')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    diagnostics.info('peer', 'dois')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('renders as text that can be pasted somewhere useful', () => {
    diagnostics.info('canal', 'entrando')
    const text = diagnostics.toText()
    expect(text).toContain('canal: entrando')
    expect(text).toMatch(/^\+\d+\.\d+s\s+info\s/)
  })

  it('gives each entry a distinct id, so React keys stay stable', () => {
    diagnostics.info('peer', 'mesmo texto')
    diagnostics.info('peer', 'mesmo texto')
    const [first, second] = diagnostics.getSnapshot()
    expect(first?.id).not.toBe(second?.id)
  })
})

describe('formatAt', () => {
  it('reads as elapsed time, not a wall clock', () => {
    expect(formatAt(0)).toBe('+0.0s')
    expect(formatAt(12_400)).toBe('+12.4s')
  })
})
