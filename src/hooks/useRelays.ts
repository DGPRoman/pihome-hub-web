import { useEffect, useState } from 'react'

import { asHubError, isAbortError, type HubError } from '../api/errors'
import { fetchRelays } from '../api/relays'
import type { Relay } from '../api/types'

/**
 * The state of something fetched: in flight, arrived, or failed.
 *
 * One value with three shapes, rather than a `data`/`error`/`isLoading` trio.
 * The trio permits states that cannot happen — data and an error together, or
 * neither while nothing is loading — and every consumer then has to guess which
 * field to trust. Here the tag decides, and the compiler will not let a
 * component read `data` until it has established that `data` exists.
 */
export type Async<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'failure'; readonly error: HubError }

/** Read the hub's relays once, on mount. */
export function useRelays(): Async<readonly Relay[]> {
  const [state, setState] = useState<Async<readonly Relay[]>>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    fetchRelays(controller.signal)
      .then((relays) => {
        // Checked on the way out as well as in the failure path below. A
        // response that had already arrived when cleanup ran would otherwise
        // still be written, letting a discarded request overwrite a newer one.
        if (controller.signal.aborted) {
          return
        }
        setState({ status: 'success', data: relays })
      })
      .catch((cause: unknown) => {
        // An abort is this component's own cleanup running, so the result is no
        // longer wanted.
        if (isAbortError(cause) || controller.signal.aborted) {
          return
        }
        setState({ status: 'failure', error: asHubError(cause) })
      })

    // Runs before the next effect and on unmount. StrictMode mounts twice in
    // development precisely to prove this exists: without it, the discarded
    // first request would still be in flight, racing the second.
    return () => {
      controller.abort()
    }

    // Empty deps: fetch on mount and not again. Refreshing on demand and
    // polling belong to the next phase, and both change this list.
  }, [])

  return state
}
