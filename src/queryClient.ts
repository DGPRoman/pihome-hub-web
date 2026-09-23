import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import type { HubError, HubErrorKind } from './api/errors'
import { sessionKeys } from './hooks/queryKeys'

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
 * A total Record rather than a Set. The Set version carried a comment saying that
 * adding a kind to HubErrorKind was "a decision made here rather than one made by
 * omission", and it was not: a new kind simply fell through as not-retryable and
 * nothing said so. This shape fails the build until the new kind is listed.
 */
const RETRYABLE: Readonly<Record<HubErrorKind, boolean>> = {
  // Nothing arrived, or something arrived too late. Both can clear on their own:
  // a Pi part way through a reboot answers the connection before the request.
  offline: true,
  timeout: true,
  // A fault the hub might not repeat.
  server: true,
  // Retrying a rejected key, an unknown relay, or a body the hub refuses just
  // repeats the same answer more slowly.
  unauthorized: false,
  'rate-limited': false,
  'not-found': false,
  malformed: false,
  // The account is not allowed. It will not become allowed by asking again, and
  // each attempt is another failure the hub's limiter counts against this client.
  forbidden: false,
  // The hub answered and the answer was unusable. A second read may well succeed,
  // but on a write this kind means the write already happened, and the retry
  // would be a second one — so no.
  unreadable: false,
  // A captive portal or a proxy in the way. It will answer identically until
  // somebody signs in to it, which is not something a retry accomplishes.
  'not-the-hub': false,
  // A bug in this app. Repeating it repeats the bug.
  unexpected: false,
}

export function createQueryClient(): QueryClient {
  /**
   * A 401 from anything means the session this browser had is no longer one.
   *
   * Handled once, on the cache, rather than in each hook. Every read and every
   * write can meet it — a session expires on its own schedule and nothing tells
   * the page when — so a per-hook answer would be the same three lines repeated
   * until one of them was forgotten, and the one that was forgotten would be a
   * panel quietly showing what the house looked like before.
   *
   * Recording it as "nobody is logged in" rather than as an error: it is the
   * truth, the shell already knows what to render for it, and the login form is
   * the only thing that helps. The session query itself cannot reach here — it
   * answers null for a 401 instead of rejecting.
   */
  const forgetTheSession = (error: HubError): void => {
    if (error.kind === 'unauthorized') {
      client.setQueryData(sessionKeys.current, null)
    }
  }

  const client = new QueryClient({
    queryCache: new QueryCache({ onError: forgetTheSession }),
    mutationCache: new MutationCache({ onError: forgetTheSession }),
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
        retry: (failureCount, error) => failureCount < MAX_RETRIES && RETRYABLE[error.kind],
      },
      mutations: {
        // A write is never retried automatically. `PUT` is idempotent, so a retry
        // would be safe, but a person pressed a switch and is waiting: failing
        // promptly and letting them decide beats a silent series of attempts.
        retry: false,
      },
    },
  })

  return client
}
