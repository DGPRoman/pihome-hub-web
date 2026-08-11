import { asHubError, HubError, isAbortError } from './errors'

/** What this app sends. Narrower than `RequestInit` so headers stay a plain object. */
export interface HubRequestInit {
  readonly method: 'GET' | 'PUT'
  readonly headers?: Record<string, string>
  readonly body?: string
}

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
      return new HubError('server', 'The hub could not complete the request.', status)
  }
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    // `Response.json` is typed `Promise<any>`, and `any` would spread through
    // everything downstream unchecked. Narrowing to `unknown` at the boundary
    // forces validation to happen.
    return (await response.json()) as unknown
  } catch {
    throw new HubError('malformed', 'The hub sent a response this app could not read.')
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

/** Raised when a body parsed as JSON but was not the shape the client requires. */
export function malformed(what: string): HubError {
  return new HubError('malformed', `The hub sent ${what} in a shape this app does not recognise.`)
}

/** True for a non-null object, narrowed so its keys can be read as `unknown`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
