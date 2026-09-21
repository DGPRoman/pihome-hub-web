/**
 * Why a request to the hub failed.
 *
 * A closed set, and exhausted rather than sampled: the retry policy in
 * `queryClient.ts` is a `Record<HubErrorKind, boolean>`, so adding a kind here
 * fails the build until somebody decides whether it is worth a second attempt.
 * The previous comment claimed the UI exhausted this. Nothing did, and a new
 * kind would have inherited "not worth retrying" by omission.
 *
 * Two of these turn on a distinction that decides whether an optimistic write
 * may be undone — see `unreadable`.
 */
export type HubErrorKind =
  | 'offline'
  | 'timeout'
  | 'unauthorized'
  | 'rate-limited'
  | 'not-found'
  /** The hub refused the request this app sent: a 422, or a 4xx it does not model. */
  | 'malformed'
  /**
   * The hub answered, and its answer could not be used.
   *
   * Only ever raised after a 2xx, which is what separates it from every other
   * kind here: the write **was applied**. Undoing the optimistic value on this
   * would leave the switch showing one thing and the circuit doing another, and
   * the operator's likely response — press it again — is a second write.
   */
  | 'unreadable'
  /**
   * Something answered, and it was not the hub.
   *
   * Every route on the hub answers JSON, errors included. A reply that is not
   * JSON came from a proxy, a captive portal, or a load balancer's own page — so
   * the request never reached the hub, and a write on this path did not happen.
   */
  | 'not-the-hub'
  | 'server'
  | 'unexpected'

/**
 * A request to the hub that did not produce usable data.
 *
 * `message` is written for a person to read on screen, so it stays free of
 * status codes and internals; `kind` and `status` carry that detail for code.
 */
export class HubError extends Error {
  readonly kind: HubErrorKind

  /** The HTTP status, or `null` when no response arrived at all. */
  readonly status: number | null

  constructor(kind: HubErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'HubError'
    this.kind = kind
    this.status = status
  }
}

/**
 * Coerce anything thrown into a `HubError`.
 *
 * A `catch` binding is `unknown` because JavaScript permits throwing any value,
 * so code downstream cannot assume it has an `Error` in hand. Everything the
 * client throws deliberately is already a `HubError`; anything else is a bug
 * here rather than a fault of the hub, and says so.
 */
export function asHubError(cause: unknown): HubError {
  if (cause instanceof HubError) {
    return cause
  }
  return new HubError('unexpected', 'Something went wrong in the app while talking to the hub.')
}

/**
 * True for the `AbortError` a cancelled `fetch` rejects with.
 *
 * Deliberately structural rather than `instanceof`. An abort arrives as a
 * `DOMException`, and whether that inherits from `Error` depends on the
 * environment — browsers say yes, jsdom says no — so an `instanceof Error`
 * guard would quietly report every cancelled request as an outage under test.
 */
export function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    (cause as { readonly name: unknown }).name === 'AbortError'
  )
}
