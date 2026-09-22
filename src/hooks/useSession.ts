import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { HubError } from '../api/errors'
import { fetchSession, logIn, logOut } from '../api/session'
import type { Session } from '../api/types'
import { sessionKeys } from './queryKeys'

/**
 * Who this browser is logged in as. `undefined` while the first probe is in
 * flight, `null` once the hub has said nobody.
 *
 * Probed rather than assumed. The token is in an `HttpOnly` cookie, so this code
 * cannot see whether one exists — asking the hub is the only way to know, and it
 * is also the only way to find out that a cookie which *does* exist has expired.
 */
export function useSession() {
  return useQuery({
    queryKey: sessionKeys.current,
    queryFn: ({ signal }) => fetchSession(signal),
    // Not polled. A session's expiry is known from the moment it is issued, and
    // a request that fails on it will re-probe this anyway — see useHubErrors.
    refetchInterval: false,
  })
}

/**
 * Every query but the session's.
 *
 * Compared on the first segment of the key rather than on the key itself: the
 * cache holds its own copy, so `===` against the constant is false for the very
 * query it is meant to name — a predicate that silently matches everything.
 */
function isNotTheSession(query: { readonly queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] !== sessionKeys.current[0]
}

export interface Credentials {
  readonly username: string
  readonly password: string
}

/** Log in, and put the resulting session straight into the cache. */
export function useLogIn() {
  const queryClient = useQueryClient()

  return useMutation<Session, HubError, Credentials>({
    mutationFn: ({ username, password }) => logIn(username, password),
    onSuccess: (session) => {
      // Written rather than invalidated: the hub has just answered this exact
      // question and a second round trip would leave the shell on the login form
      // for as long as it took.
      queryClient.setQueryData(sessionKeys.current, session)
      // Everything else was fetched, or refused, as somebody else — including as
      // nobody. None of it is this account's view of the house.
      //
      // Everything *else*: invalidating the session too would immediately refetch
      // the answer just written, which is the round trip the line above exists to
      // avoid.
      void queryClient.invalidateQueries({ predicate: isNotTheSession })
    },
  })
}

/** Log out, and forget everything that was read while logged in. */
export function useLogOut() {
  const queryClient = useQueryClient()

  return useMutation<void, HubError, void>({
    mutationFn: () => logOut(),
    onSettled: () => {
      // On failure too. Whatever the hub said, the person asked to be logged out,
      // and leaving the house on screen after that is the one outcome nobody
      // wants — a shared laptop is the whole reason this button exists.
      queryClient.setQueryData(sessionKeys.current, null)
      queryClient.removeQueries({ predicate: isNotTheSession })
    },
  })
}
