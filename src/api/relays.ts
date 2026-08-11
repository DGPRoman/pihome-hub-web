import { asHubError, HubError, isAbortError } from './errors'
import type { Relay } from './types'

const RELAYS_PATH = '/v1/relays'

/** What this module sends. Narrower than `RequestInit` so headers stay a plain object. */
interface HubRequestInit {
  readonly method: 'GET' | 'PUT'
  readonly headers?: Record<string, string>
  readonly body?: string
}

/**
 * Read every relay and its current state.
 *
 * Same-origin by design: `npm run dev` proxies `/v1` to the hub, and in
 * production the hub serves this app. No base URL, and no API key — the client
 * never holds one. See README.
 *
 * Rejects with a `HubError`, or with the `AbortError` of a cancelled request.
 */
export async function fetchRelays(signal: AbortSignal | null = null): Promise<readonly Relay[]> {
  return onlyHubErrors(async () => {
    const response = await request(RELAYS_PATH, { method: 'GET' }, signal)
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
    const response = await request(
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
 * Hold both public functions to one failure type.
 *
 * Everything raised deliberately below is already a `HubError`, but "already is"
 * is an assumption, and the app types every query and mutation error as one. A
 * stray `TypeError` from a bug here would otherwise arrive at a component
 * claiming to have a `kind` it does not have.
 */
async function onlyHubErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (cause) {
    // An abort is the caller's own cleanup and must stay recognisable.
    if (isAbortError(cause)) {
      throw cause
    }
    throw asHubError(cause)
  }
}

async function request(
  path: string,
  init: HubRequestInit,
  signal: AbortSignal | null,
): Promise<Response> {
  let response: Response

  try {
    response = await fetch(path, {
      method: init.method,
      signal,
      headers: { Accept: 'application/json', ...init.headers },
      ...(init.body === undefined ? {} : { body: init.body }),
    })
  } catch (cause) {
    // `fetch` rejects only when no answer arrived at all — DNS, a refused
    // connection, or an abort. It resolves for 401 and 500 alike, which is why
    // `response.ok` is checked separately below.
    if (isAbortError(cause)) {
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
    case 422:
      // The hub validates bodies strictly and guesses at nothing, so this means
      // the client sent a shape it does not accept — a bug here, not something
      // the reader can act on.
      return new HubError('malformed', 'The hub rejected the request this app sent.', status)
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

function malformed(): HubError {
  return new HubError(
    'malformed',
    'The hub sent relay data in a shape this app does not recognise.',
  )
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
 * Validate one relay object.
 *
 * Exported for its tests. Builds its own object rather than passing the parsed
 * one through, so fields the client was not promised cannot ride along.
 */
export function parseRelay(body: unknown): Relay {
  if (!isRelay(body)) {
    throw malformed()
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
  if (typeof body !== 'object' || body === null || !('relays' in body)) {
    throw malformed()
  }

  // No assertion needed: the `in` check above narrowed `body` to something
  // known to carry a `relays` key, so destructuring yields `unknown`.
  const { relays } = body
  if (!Array.isArray(relays)) {
    throw malformed()
  }

  return relays.map((relay: unknown) => parseRelay(relay))
}
