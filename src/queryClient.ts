import { QueryClient } from '@tanstack/react-query'

import type { HubError, HubErrorKind } from './api/errors'

/**
 * Tell TanStack Query what an error is in this app.
 *
 * Declaration merging into the library's own `Register` interface: without it,
 * every `error` it hands back is typed `Error`, and reading `error.kind` would
 * need a cast at each use. The API layer guarantees it only ever rejects with a
 * `HubError`, so this registration is a claim the code upholds rather than a
 * convenient lie.
 */
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: HubError
  }
}

/** How long a relay read is treated as fresh enough to reuse without refetching. */
export const STALE_TIME_MS = 2_000

/**
 * How often to re-read relay state while the page is open.
 *
 * The hub is not the only thing that changes a relay: its automation rules fire
 * on sensor readings, and someone else may be holding a phone. Without polling
 * the page would quietly drift out of date and look authoritative while doing it.
 */
export const POLL_INTERVAL_MS = 10_000

export const MAX_RETRIES = 2

/**
 * Failures worth a second attempt.
 *
 * A Set rather than a chain of comparisons so that adding a kind to HubErrorKind
 * is a decision made here rather than one made by omission.
 */
const RETRYABLE: ReadonlySet<HubErrorKind> = new Set(['offline', 'server', 'timeout'])

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        refetchInterval: POLL_INTERVAL_MS,
        // Retrying a rejected key or an unknown relay just repeats the same
        // answer more slowly. Only a hub that did not answer, or one that failed
        // in a way it might not fail again, is worth a second attempt.
        //
        // A timeout belongs in that set: something is listening, and a Pi part way
        // through a reboot answers the connection before it can answer the request.
        retry: (failureCount, error) => failureCount < MAX_RETRIES && RETRYABLE.has(error.kind),
      },
      mutations: {
        // A write is never retried automatically. `PUT` is idempotent, so a retry
        // would be safe, but a person pressed a switch and is waiting: failing
        // promptly and letting them decide beats a silent series of attempts.
        retry: false,
      },
    },
  })
}
