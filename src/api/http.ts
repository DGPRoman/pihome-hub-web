import { asHubError, HubError, isAbortError } from './errors'

/**
 * How long the hub is given to answer before a request is abandoned.
 *
 * Without one, a hub that accepts the TCP connection and then stops responding is
 * indistinguishable from a slow one: the request simply never settles. For a Pi on
 * a home network that can be mid-reboot, mid-reconnect or gone, that is the common
 * failure rather than an exotic one.
 *
 * Shorter than the polling interval on purpose, so a hung read is abandoned before
 * the next one is due and polls cannot pile up behind it. A test holds the two
 * numbers in that order.
 */
export const REQUEST_TIMEOUT_MS = 8_000

/**
 * Why a request was abandoned, carried on the signal itself.
 *
 * A deadline and a caller cancelling both surface as the same `AbortError`, and
 * only one of them is worth telling anyone about. Recorded as the abort reason
 * rather than in a flag beside it: a flag written inside the timer's callback is
 * something TypeScript cannot see being written, so the check that reads it gets
 * reported as unreachable.
 */
const TIMED_OUT = Symbol('the hub did not answer in time')

/** What this app sends. Narrower than `RequestInit` so headers stay a plain object. */
export interface HubRequestInit {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly headers?: Record<string, string>
  readonly body?: string
}

/**
 * Methods that change nothing, as RFC 9110 defines safe.
 *
 * Kept as a set rather than checked inline because two places ask the question
 * and they must not drift: this file, and the hub, which requires the header
 * below on exactly the methods this does not list.
 */
const SAFE_METHODS: ReadonlySet<HubRequestInit['method']> = new Set(['GET'])

/**
 * Header the hub requires on a write authenticated by the session cookie.
 *
 * Its presence is the whole check and the hub never reads the value — a page on
 * another origin cannot set a header like this without a CORS preflight, and the
 * hub answers no CORS headers, so the request is never sent. That is what stops a
 * request some other site caused this browser to make from switching a circuit.
 *
 * Sent on every write, including one the hub would have accepted on an API key
 * alone. Deciding per request would mean this client knowing which credential the
 * proxy in front of it is using, which is exactly the thing it is written not to
 * know.
 */
const CSRF_HEADER = 'X-Pihome-CSRF'

/**
 * Send one request to the hub and hand back the response, or raise.
 *
 * Same-origin by design: `npm run dev` proxies `/v1` to the hub, so there is no
 * base URL and no API key here — the client never holds one. See README.
 */
export async function hubRequest(
  path: string,
  init: HubRequestInit,
  signal: AbortSignal | null,
): Promise<Response> {
  let response: Response

  // Its own controller rather than AbortSignal.timeout, because what matters
  // afterwards is *why* it aborted: a deadline and a caller cancelling both arrive
  // as the same AbortError, and only one of them is worth telling anyone about.
  const deadline = new AbortController()
  const timer = setTimeout(() => {
    deadline.abort(TIMED_OUT)
  }, REQUEST_TIMEOUT_MS)

  const cancel = () => {
    deadline.abort()
  }
  if (signal !== null) {
    if (signal.aborted) {
      cancel()
    } else {
      signal.addEventListener('abort', cancel, { once: true })
    }
  }

  try {
    response = await fetch(path, {
      method: init.method,
      signal: deadline.signal,
      // Same-origin, so the session cookie travels by default; this is explicit
      // because the default is a thing to rely on deliberately rather than by
      // accident.
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(SAFE_METHODS.has(init.method) ? {} : { [CSRF_HEADER]: '1' }),
        ...init.headers,
      },
      ...(init.body === undefined ? {} : { body: init.body }),
    })
  } catch (cause) {
    // `fetch` rejects only when no answer arrived at all — DNS, a refused
    // connection, or an abort. It resolves for 401 and 500 alike, which is why
    // `response.ok` is checked separately below.
    if (deadline.signal.reason === TIMED_OUT) {
      // Distinct from 'offline': something is listening, which is a different
      // thing to look at than a hub that is switched off.
      throw new HubError('timeout', 'The hub accepted the connection but did not answer.')
    }
    if (isAbortError(cause)) {
      // The caller cancelled this itself; reporting an outage would be a lie.
      throw cause
    }
    throw new HubError('offline', 'The hub did not answer. Is it running?')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }

  if (!response.ok) {
    throw errorForResponse(response)
  }
  // A 2xx that is not JSON did not come from the hub. Checked after the status
  // rather than before it, so a 502 from the dev proxy — which answers HTML —
  // keeps the message that names the real cause.
  if (!looksLikeTheHub(response)) {
    throw notTheHub(response.status)
  }
  return response
}

/**
 * Statuses RFC 9110 defines as carrying no body.
 *
 * A response with no body has no media type to check, and demanding one of it is
 * how a perfectly good answer gets called a captive portal. `DELETE /v1/session`
 * is the hub's 204, and it is what found this.
 */
const BODILESS_STATUSES: ReadonlySet<number> = new Set([204, 205, 304])

/**
 * True when a response could plausibly have come from the hub.
 *
 * Every route on it answers JSON where it answers anything at all, errors
 * included, so a body that is not JSON came from a proxy, a captive portal, or a
 * load balancer's own page. Matched on the media type alone: the charset and any
 * `+json` suffix are somebody else's business.
 */
function looksLikeTheHub(response: Response): boolean {
  if (BODILESS_STATUSES.has(response.status)) {
    return true
  }
  const contentType = response.headers.get('content-type')
  return contentType !== null && /^application\/(\w+\+)?json\b/i.test(contentType.trim())
}

function notTheHub(status: number): HubError {
  return new HubError(
    'not-the-hub',
    'Something answered instead of the hub. Check for a captive portal or a proxy ' +
      'on this network.',
    status,
  )
}

function errorForResponse(response: Response): HubError {
  const status = response.status
  switch (status) {
    case 401:
      return new HubError('unauthorized', 'The hub rejected the API key.', status)
    case 403:
      // The hub answers 403 for two things: a role that is not enough, and a
      // cookie-authenticated write with no CSRF header. Only the first can happen
      // here — every write this client makes carries the header unconditionally,
      // which session.test.ts holds it to — so naming the role is not a guess.
      return new HubError(
        'forbidden',
        'This account is not allowed to do that. Ask an admin, or log in as somebody who is.',
        status,
      )
    case 404:
      return new HubError('not-found', 'The hub has no record of that.', status)
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
      return errorForUnmodelledStatus(response)
  }
}

/**
 * A status this client has no specific answer for.
 *
 * Everything here used to collapse into one message, so a 403, a 409, a 502 from
 * something in front of the hub and a captive portal all read identically and the
 * operator could not tell "the hub refused this" from "the hub was never
 * reached". The number is in the message because for an unmodelled status it is
 * the only thing left to act on — every message above says something specific
 * instead, which is why none of them carry one.
 */
function errorForUnmodelledStatus(response: Response): HubError {
  const status = response.status

  if (!looksLikeTheHub(response)) {
    return notTheHub(status)
  }
  if (status >= 500) {
    return new HubError('server', `The hub failed while handling the request (${status}).`, status)
  }
  if (status >= 400) {
    return new HubError('malformed', `The hub refused the request (${status}).`, status)
  }
  // 1xx and 3xx reaching here at all means fetch did not follow something it
  // normally would, which is a redirect loop or a proxy in the way.
  return new HubError(
    'unexpected',
    `The hub answered in a way this app cannot use (${status}).`,
    status,
  )
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    // `Response.json` is typed `Promise<any>`, and `any` would spread through
    // everything downstream unchecked. Narrowing to `unknown` at the boundary
    // forces validation to happen.
    return (await response.json()) as unknown
  } catch {
    // 'unreadable', not 'malformed'. This runs only on a response the hub already
    // accepted, so a write that reaches here *happened* — see HubErrorKind.
    throw new HubError('unreadable', 'The hub answered, but this app could not read the reply.')
  }
}

/**
 * Hold every public request function to one failure type.
 *
 * Everything raised deliberately is already a `HubError`, but "already is" is an
 * assumption, and the app registers `HubError` as the error type for every query
 * and mutation. A stray `TypeError` from a bug here would otherwise arrive at a
 * component claiming to have a `kind` it does not have.
 */
export async function onlyHubErrors<T>(operation: () => Promise<T>): Promise<T> {
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

/**
 * Raised when a body parsed as JSON but was not the shape the client requires.
 *
 * 'unreadable' for the same reason as `readJson`: every parser runs on a response
 * the hub returned 2xx for, so a write that gets this far was applied.
 */
export function malformed(what: string): HubError {
  return new HubError('unreadable', `The hub sent ${what} in a shape this app does not recognise.`)
}

/** True for a non-null object, narrowed so its keys can be read as `unknown`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
