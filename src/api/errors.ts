/**
 * Why a request to the hub failed.
 *
 * A closed set, so the UI can decide what to show by exhausting it rather than
 * by matching on status codes or, worse, on message text.
 */
export type HubErrorKind =
  'offline' | 'unauthorized' | 'rate-limited' | 'not-found' | 'malformed' | 'server' | 'unexpected'

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
