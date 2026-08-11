const SECOND_MS = 1_000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// Built once: constructing an Intl formatter is not free, and this one never varies.
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/**
 * Describe how long before `now` something happened, in words.
 *
 * `Intl.RelativeTimeFormat` rather than a hand-written ladder of English strings:
 * it already knows the plural rules of the reader's locale, and "1 minute ago"
 * versus "2 minutes ago" is exactly the kind of detail a hand-written version gets
 * wrong in the second language it meets.
 *
 * Both arguments are explicit so this stays a pure function of its inputs, which
 * is what makes it testable without freezing the system clock.
 */
export function formatRelativeTime(from: Date, now: Date): string {
  // Clamped at zero: the hub keeps its own clock, and one running slightly ahead
  // would otherwise produce a reading that arrives "in 4 seconds".
  const elapsedMs = Math.max(0, now.getTime() - from.getTime())

  if (elapsedMs < MINUTE_MS) {
    return relative.format(-Math.round(elapsedMs / SECOND_MS), 'second')
  }
  if (elapsedMs < HOUR_MS) {
    return relative.format(-Math.round(elapsedMs / MINUTE_MS), 'minute')
  }
  if (elapsedMs < DAY_MS) {
    return relative.format(-Math.round(elapsedMs / HOUR_MS), 'hour')
  }
  return relative.format(-Math.round(elapsedMs / DAY_MS), 'day')
}
