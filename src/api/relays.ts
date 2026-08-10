import { HubError, isAbortError } from './errors'
import type { Relay } from './types'

const RELAYS_PATH = '/v1/relays'

/**
 * Read every relay and its current state.
 *
 * Same-origin by design: `npm run dev` proxies `/v1` to the hub, and in
 * production the hub serves this app. No base URL, and no API key — the client
 * never holds one. See README.
 */
export async function fetchRelays(signal: AbortSignal | null = null): Promise<readonly Relay[]> {
  const response = await get(RELAYS_PATH, signal)
  return parseRelayCollection(await readJson(response))
}

async function get(path: string, signal: AbortSignal | null): Promise<Response> {
  let response: Response

  try {
    response = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    // `fetch` rejects only when no answer arrived at all — DNS, a refused
    // connection, or an abort. It resolves for 401 and 500 alike, which is why
    // `response.ok` is checked separately below.
    if (isAbortError(cause)) {
      // The caller cancelled this itself; reporting an outage would be a lie.
      throw cause
    }
    throw new HubError('offline', 'The hub did not answer. Is it running?')
  }

  if (!response.ok) {
    throw errorForStatus(response.status)
  }
  return response
}

function errorForStatus(status: number): HubError {
  switch (status) {
    case 401:
      return new HubError('unauthorized', 'The hub rejected the API key.', status)
    case 404:
      return new HubError('not-found', 'The hub has no record of that relay.', status)
    case 429:
      return new HubError(
        'rate-limited',
        'The hub is refusing further attempts for now. Wait a few minutes.',
        status,
      )
    // A gateway reporting that what sits behind it is unreachable. In
    // development that gateway is the Vite proxy, which answers 502 for a hub
    // that is not running; treating it as a server fault would blame the hub for
    // being switched off.
    case 502:
    case 503:
    case 504:
      return new HubError('offline', 'The hub did not answer. Is it running?', status)
    default:
      return new HubError('server', 'The hub could not complete the request.', status)
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    // `Response.json` is typed `Promise<any>`, and `any` would spread through
    // everything downstream unchecked. Narrowing to `unknown` at the boundary
    // forces the validation below to happen.
    return (await response.json()) as unknown
  } catch {
    throw new HubError('malformed', 'The hub sent a response this app could not read.')
  }
}

function isRelay(value: unknown): value is Relay {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.on === 'boolean'
  )
}

/**
 * Validate a `GET /v1/relays` body and return the relays it contains.
 *
 * Exported for its tests. Types are erased at runtime, so asserting a shape
 * onto parsed JSON would only silence the compiler — a hub on a different
 * version, or a captive portal answering with a login page, would then surface
 * as `undefined` somewhere deep in a component. This checks instead, and builds
 * its own objects rather than passing the parsed ones through, so unrecognised
 * fields cannot ride along.
 */
export function parseRelayCollection(body: unknown): readonly Relay[] {
  const malformed = new HubError(
    'malformed',
    'The hub sent relay data in a shape this app does not recognise.',
  )

  if (typeof body !== 'object' || body === null || !('relays' in body)) {
    throw malformed
  }

  // No assertion needed: the `in` check above narrowed `body` to something
  // known to carry a `relays` key, so destructuring yields `unknown`.
  const { relays } = body
  if (!Array.isArray(relays)) {
    throw malformed
  }

  const parsed: Relay[] = []
  for (const item of relays) {
    if (!isRelay(item)) {
      throw malformed
    }
    parsed.push({ id: item.id, label: item.label, on: item.on })
  }
  return parsed
}
