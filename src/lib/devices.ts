import type { Device } from '../api/types'

/**
 * Where a device stands with the hub, as one of four answers.
 *
 * Four rather than two, because the hub reports three states and two of them look
 * like "not working" while meaning quite different things:
 *
 * - `never-announced` — the device is declared on the hub and has never said
 *   where it is. Nobody has powered it on, or it cannot reach the hub. Nothing is
 *   wrong with the polling; there is nothing to poll.
 * - `never-polled` — it announced, and the hub has not yet got round to asking.
 *   A few seconds after a boot, and not a fault.
 * - `answering` — the last poll succeeded.
 * - `silent` — it announced, the hub asked, and the answer did not come. This is
 *   the only one of the four that is a fault.
 */
export type DeviceStanding = 'never-announced' | 'never-polled' | 'answering' | 'silent'

/**
 * Judge one device.
 *
 * Deliberately not `freshnessOf`. That function exists because a sensor's age has
 * to be *inferred* — the hub bumps one timestamp for every reading, so whether a
 * particular quantity is current is a question nobody has answered. Here the hub
 * has answered it: it is the one doing the asking, so it knows whether the answer
 * arrived. Running a timestamp comparison over the top of that would be guessing
 * at something already stated, and would disagree with it the moment the hub's
 * poll interval changed.
 */
export function standingOf(device: Device): DeviceStanding {
  if (device.address === null) {
    return 'never-announced'
  }
  if (device.reachable === null) {
    return 'never-polled'
  }
  return device.reachable ? 'answering' : 'silent'
}

/**
 * True when there is a reading to show at all.
 *
 * The date is deliberately not part of this. A failed poll leaves the last
 * reading in place on purpose — the hub keeps it so a client can show what the
 * device said and when, rather than showing nothing — and the same reasoning
 * applies one step further: a reading whose age is missing is still a reading,
 * and dropping it because it cannot be dated loses something true. The row says
 * the age is unknown instead, which is the honest version of the same thing.
 *
 * Nothing is worse than stale here. A reading from four minutes ago is
 * information; a blank space is not.
 */
export function hasReading(device: Device): boolean {
  return device.state !== null
}

/**
 * Render one value out of a device's own status document.
 *
 * Generic on purpose. The hub passes the document through exactly as the device
 * served it and declines to declare what is in it, because that is the device's
 * contract to state — so this renders whatever is there rather than naming
 * fields it would then have to keep in step with another repository.
 */
export function formatStateValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value === null) {
    return 'null'
  }
  // An object or an array nested inside the document. Shown as what it is rather
  // than as "[object Object]", which is what template interpolation would give.
  return JSON.stringify(value)
}
