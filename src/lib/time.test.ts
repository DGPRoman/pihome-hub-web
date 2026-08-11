import { describe, expect, it } from 'vitest'

import { formatRelativeTime } from './time'

const NOW = new Date('2026-08-11T12:00:00Z')

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms)
}

describe('formatRelativeTime', () => {
  it.each([
    ['seconds', ago(30_000), '30 seconds ago'],
    ['a minute', ago(60_000), '1 minute ago'],
    ['minutes', ago(15 * 60_000), '15 minutes ago'],
    ['an hour', ago(60 * 60_000), '1 hour ago'],
    ['hours', ago(5 * 60 * 60_000), '5 hours ago'],
    ['days', ago(3 * 24 * 60 * 60_000), '3 days ago'],
  ])('describes %s', (_label, from, expected) => {
    expect(formatRelativeTime(from, NOW)).toBe(expected)
  })

  it('says "now" for the present instant', () => {
    expect(formatRelativeTime(NOW, NOW)).toBe('now')
  })

  it('clamps a timestamp from the future instead of counting forwards', () => {
    // The hub keeps its own clock. One running a few seconds ahead should not
    // produce a reading that arrives "in 4 seconds".
    const future = new Date(NOW.getTime() + 4_000)

    expect(formatRelativeTime(future, NOW)).toBe('now')
  })
})
