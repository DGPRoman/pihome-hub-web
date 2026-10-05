import { describe, expect, it } from 'vitest'

import { formatClockTime, formatRelativeTime, formatTimeLeft } from './time'

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

describe('formatTimeLeft', () => {
  function inMs(ms: number): Date {
    return new Date(NOW.getTime() + ms)
  }

  it.each([
    ['the whole fifteen minutes', inMs(15 * 60_000), '15 minutes'],
    ['a part minute, rounded up', inMs(14 * 60_000 + 1), '15 minutes'],
    ['one minute', inMs(60_000), '1 minute'],
    ['the last minute', inMs(59_999), 'less than a minute'],
    ['the last second', inMs(1), 'less than a minute'],
  ])('describes %s', (_label, until, expected) => {
    expect(formatTimeLeft(until, NOW)).toBe(expected)
  })

  it('says nothing is left once it has passed, rather than "0 minutes"', () => {
    expect(formatTimeLeft(NOW, NOW)).toBeNull()
    expect(formatTimeLeft(inMs(-1), NOW)).toBeNull()
  })
})

describe('formatClockTime', () => {
  it('writes a time of day without the date', () => {
    expect(formatClockTime(NOW)).toMatch(/\d{1,2}[:.]\d{2}/)
    expect(formatClockTime(NOW)).not.toMatch(/2026/)
  })
})
