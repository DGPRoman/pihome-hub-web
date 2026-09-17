import type { Reading } from '../api/types'

/**
 * How much a single reading can be trusted to describe the present.
 *
 * `unknown` is a real answer and not a failure: a reading whose age cannot be
 * established must not be shown as current, and must not be shown as stale
 * either. Saying so is the point — this client's stated principle is that absent,
 * stale and zero are three different things.
 */
export type Freshness = 'current' | 'stale' | 'unknown'

/**
 * Judge one reading against the window its device is judged by.
 *
 * The device-wide `stale` flag cannot answer this. The hub bumps `last_seen` on
 * any reading, so a device pushing temperature every minute reports `stale:
 * false` while its motion is hours old — and rendering that motion as current is
 * exactly the collapse this function exists to prevent.
 *
 * @param reading            The quantity to judge.
 * @param staleAfterSeconds  The device's window, or null from a hub that does
 *                           not report it. Without it the answer is `unknown`:
 *                           there is no sound way to guess the window, because
 *                           a device being fresh bounds it from below only.
 * @param asOf               When the displayed data was fetched.
 */
export function freshnessOf(
  reading: Reading<unknown>,
  staleAfterSeconds: number | null,
  asOf: Date,
): Freshness {
  if (reading.kind !== 'value' || reading.at === null || staleAfterSeconds === null) {
    return 'unknown'
  }

  const ageMs = asOf.getTime() - reading.at.getTime()

  // A reading from the future is the hub's clock running ahead, not a reading
  // that has not happened yet. Treated as current rather than as an error: the
  // alternative is a sensor that reads as broken because of clock skew.
  return ageMs > staleAfterSeconds * 1_000 ? 'stale' : 'current'
}
