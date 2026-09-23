import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'
import type { Device } from './types'

const DEVICES_PATH = '/v1/devices'

/**
 * Read every declared device and what the hub last knew of it.
 *
 * Read-only, because the route is. Which devices exist is declared in a file on
 * the hub, and where each one is comes from the device announcing it — neither is
 * something a browser can change, and the hub serves no route that would let it.
 *
 * Rejects with a `HubError`, or with the `AbortError` of a cancelled request.
 */
export async function fetchDevices(signal: AbortSignal | null = null): Promise<readonly Device[]> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(DEVICES_PATH, { method: 'GET' }, signal)
    return parseDeviceCollection(await readJson(response))
  })
}

/** A field the hub sends as a string or an explicit `null`. */
function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    throw malformed('device data')
  }
  return value
}

/**
 * Read a three-state boolean, keeping "not yet" apart from "no".
 *
 * `reachable` is the field this exists for. Collapsing its `null` into `false`
 * would report a device nobody has powered on as one that has stopped answering,
 * and send somebody looking for a fault in a device that has never run.
 */
function nullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'boolean') {
    throw malformed('device data')
  }
  return value
}

/**
 * Turn an ISO-8601 timestamp into a `Date`, or `null`.
 *
 * `new Date(...)` never throws: handed nonsense it returns an Invalid Date, which
 * formats as "Invalid Date" on screen and compares as NaN everywhere else.
 * Checking here makes a bad timestamp a recognisable failure rather than a
 * cosmetic one.
 */
function parseTimestamp(value: unknown): Date | null {
  const text = nullableString(value)
  if (text === null) {
    return null
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw malformed('a device timestamp')
  }
  return parsed
}

/**
 * Take the device's own status document, or `null`.
 *
 * Validated as far as "it is an object" and no further. The hub passes this
 * through exactly as the device served it, and says so: what the fields mean is
 * the device's contract, and a parser here that knew them would have to be
 * changed every time a device added one.
 *
 * An array is refused rather than accepted as an object, which is what
 * `typeof [] === 'object'` would otherwise let through and then render as a list
 * of numeric keys.
 */
function parseState(value: unknown): Readonly<Record<string, unknown>> | null {
  if (value === null || value === undefined) {
    return null
  }
  if (!isRecord(value) || Array.isArray(value)) {
    throw malformed('device data')
  }
  return value
}

/**
 * Validate one device snapshot.
 *
 * Exported for its tests. Maps the hub's snake_case onto this app's camelCase and
 * builds its own object, so unrecognised fields cannot ride along.
 */
export function parseDevice(body: unknown): Device {
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    typeof body.label !== 'string' ||
    typeof body.kind !== 'string'
  ) {
    throw malformed('device data')
  }

  return {
    id: body.id,
    label: body.label,
    kind: body.kind,
    address: nullableString(body.address),
    firmware: nullableString(body.firmware),
    announcedAt: parseTimestamp(body.announced_at),
    reachable: nullableBoolean(body.reachable),
    lastPolledAt: parseTimestamp(body.last_polled_at),
    lastSeenAt: parseTimestamp(body.last_seen_at),
    unreachableSince: parseTimestamp(body.unreachable_since),
    lastError: nullableString(body.last_error),
    state: parseState(body.state),
  }
}

/** Validate a `GET /v1/devices` body and return the devices it contains. */
export function parseDeviceCollection(body: unknown): readonly Device[] {
  if (!isRecord(body) || !('devices' in body)) {
    throw malformed('device data')
  }

  const { devices } = body
  if (!Array.isArray(devices)) {
    throw malformed('device data')
  }

  return devices.map((device: unknown) => parseDevice(device))
}
