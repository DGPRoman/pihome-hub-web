import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'
import type { Relay } from './types'

const RELAYS_PATH = '/v1/relays'

/**
 * Read every relay and its current state.
 *
 * Rejects with a `HubError`, or with the `AbortError` of a cancelled request.
 */
export async function fetchRelays(signal: AbortSignal | null = null): Promise<readonly Relay[]> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(RELAYS_PATH, { method: 'GET' }, signal)
    return parseRelayCollection(await readJson(response))
  })
}

/**
 * Drive one relay to a state, and return the state the hub reports afterwards.
 *
 * `PUT` with the desired state rather than `POST /toggle`, even though a switch
 * is conceptually a toggle. Toggling is not idempotent: two clicks that race, or
 * one request retried after a timeout, leave the circuit in whichever state the
 * requests happened to interleave into. Naming the wanted state means a replay
 * is harmless, which matters more than brevity when the thing on the other end
 * closes a mains circuit.
 *
 * Rejects with a `HubError`, or with the `AbortError` of a cancelled request.
 */
export async function setRelay(
  id: string,
  on: boolean,
  signal: AbortSignal | null = null,
): Promise<Relay> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(
      `${RELAYS_PATH}/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      },
      signal,
    )
    return parseRelay(await readJson(response))
  })
}

/**
 * Drive every relay to one state, and return the states the hub reports afterwards.
 *
 * `PUT` for the same reason `setRelay` uses it, and more so: `POST /v1/relays/toggle`
 * inverts each relay independently, so replaying it against a house that is half on
 * lands somewhere different every time.
 *
 * Rejects with a `HubError`, or with the `AbortError` of a cancelled request.
 */
export async function setAllRelays(
  on: boolean,
  signal: AbortSignal | null = null,
): Promise<readonly Relay[]> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(
      RELAYS_PATH,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on }),
      },
      signal,
    )
    return parseRelayCollection(await readJson(response))
  })
}

function isRelay(value: unknown): value is Relay {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' && typeof value.label === 'string' && typeof value.on === 'boolean'
  )
}

/**
 * Validate one relay object.
 *
 * Exported for its tests. Builds its own object rather than passing the parsed
 * one through, so fields the client was not promised cannot ride along.
 */
export function parseRelay(body: unknown): Relay {
  if (!isRelay(body)) {
    throw malformed('relay data')
  }
  return { id: body.id, label: body.label, on: body.on }
}

/**
 * Validate a `GET /v1/relays` body and return the relays it contains.
 *
 * Types are erased at runtime, so asserting a shape onto parsed JSON would only
 * silence the compiler — a hub on a different version, or a captive portal
 * answering with a login page, would then surface as `undefined` somewhere deep
 * in a component. This checks instead.
 */
export function parseRelayCollection(body: unknown): readonly Relay[] {
  if (!isRecord(body) || !('relays' in body)) {
    throw malformed('relay data')
  }

  const { relays } = body
  if (!Array.isArray(relays)) {
    throw malformed('relay data')
  }

  return relays.map((relay: unknown) => parseRelay(relay))
}
