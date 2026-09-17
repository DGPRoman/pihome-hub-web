import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'
import type { Reading, Sensor } from './types'

const SENSORS_PATH = '/v1/sensors'

/**
 * Read every configured sensor and its latest reading.
 *
 * Authenticated with the relay key, not the sensor key: the hub deliberately
 * splits pushing readings from reading the house, so firmware that reports motion
 * cannot also survey it. Nothing here needs to know that — the dev proxy attaches
 * whichever key it was given — but it explains why this is a read-only client.
 *
 * Rejects with a `HubError`, or with the `AbortError` of a cancelled request.
 */
export async function fetchSensors(signal: AbortSignal | null = null): Promise<readonly Sensor[]> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(SENSORS_PATH, { method: 'GET' }, signal)
    return parseSensorCollection(await readJson(response))
  })
}

/** A field the hub sends as a value or an explicit `null`. */
function nullable<T>(value: unknown, isValid: (candidate: unknown) => candidate is T): T | null {
  if (value === null || value === undefined) {
    return null
  }
  if (!isValid(value)) {
    throw malformed('sensor data')
  }
  return value
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isFiniteNumber(value: unknown): value is number {
  // `Number.isFinite` rather than `typeof`: JSON cannot carry NaN or Infinity,
  // but a hand-rolled producer emitting `1e999` would arrive as Infinity and then
  // render as "Infinity °C".
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Turn an ISO-8601 timestamp into a `Date`, or `null`.
 *
 * `new Date(...)` never throws: handed nonsense it returns an Invalid Date, whose
 * `getTime()` is NaN and which formats as "Invalid Date" on screen. Checking here
 * means a bad timestamp is a recognisable failure rather than a cosmetic one.
 */
function parseTimestamp(value: unknown): Date | null {
  const text = nullable(value, (candidate): candidate is string => typeof candidate === 'string')
  if (text === null) {
    return null
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw malformed('a sensor timestamp')
  }
  return parsed
}

/**
 * Read one quantity, keeping apart the ways it can be missing.
 *
 * A field that is not there and a field that is `null` mean different things —
 * "this hub does not report it" and "this device never has" — and rendering both
 * the same was indistinguishable on screen. `at` being null is a third case: the
 * value is real and its age is unknown, which is worth showing rather than a
 * reason to throw the value away.
 */
function reading<T>(
  body: Record<string, unknown>,
  field: string,
  at: Date | null,
  isValid: (candidate: unknown) => candidate is T,
): Reading<T> {
  if (!(field in body)) {
    return { kind: 'unsupported' }
  }

  const raw = body[field]
  if (raw === null || raw === undefined) {
    return { kind: 'never' }
  }
  if (!isValid(raw)) {
    throw malformed('sensor data')
  }

  return { kind: 'value', value: raw, at }
}

/**
 * Validate one sensor snapshot.
 *
 * Exported for its tests. Maps the hub's snake_case onto this app's camelCase and
 * builds its own object, so unrecognised fields cannot ride along.
 */
export function parseSensor(body: unknown): Sensor {
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.label !== 'string') {
    throw malformed('sensor data')
  }
  if (typeof body.stale !== 'boolean') {
    throw malformed('sensor data')
  }

  // Temperature and humidity share one timestamp: the hub records them together,
  // because the sensor that reports one reports the other in the same push.
  const climateAt = parseTimestamp(body.climate_updated_at)

  return {
    id: body.id,
    label: body.label,
    stale: body.stale,
    // Optional so an older hub still parses. Its absence costs the per-quantity
    // judgement, not the reading.
    staleAfterSeconds: nullable(body.stale_after_seconds, isFiniteNumber),
    lastSeen: parseTimestamp(body.last_seen),
    motion: reading(body, 'motion', parseTimestamp(body.motion_updated_at), isBoolean),
    temperature: reading(body, 'temperature', climateAt, isFiniteNumber),
    humidity: reading(body, 'humidity', climateAt, isFiniteNumber),
  }
}

/** Validate a `GET /v1/sensors` body and return the sensors it contains. */
export function parseSensorCollection(body: unknown): readonly Sensor[] {
  if (!isRecord(body) || !('sensors' in body)) {
    throw malformed('sensor data')
  }

  const { sensors } = body
  if (!Array.isArray(sensors)) {
    throw malformed('sensor data')
  }

  return sensors.map((sensor: unknown) => parseSensor(sensor))
}
