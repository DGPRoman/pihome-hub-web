import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Role, Session } from '../api/types'
import { sessionKeys } from '../hooks/queryKeys'
import { createQueryClient } from '../queryClient'

/** A session for a given role, for a test that needs one to exist. */
export function sessionAs(role: Role): Session {
  return {
    username: role,
    role,
    // Far enough out that nothing under test is near it. Expiry is the session
    // layer's subject, not every component's.
    expiresAt: new Date('2099-01-01T00:00:00Z'),
  }
}

export interface RenderWithQueryOptions {
  /**
   * Who to render as, written into the cache before the first render.
   *
   * Omitted means the session query is left alone — which is what a test about
   * logging in wants, and is why this is not defaulted to somebody. A component
   * that reads the role gets `undefined` then, and treats it as the least it
   * could be.
   */
  readonly session?: Session | null
}

/**
 * Render inside a fresh query client.
 *
 * Fresh per call so no cache survives between tests. The production defaults are
 * deliberately not reused, and each override is here for its own reason:
 *
 * - `retry: false` on queries, so a test asserting a failure does not wait out two
 *   attempts and their backoff. On mutations it happens to match production, which
 *   is why `queryClient.test.ts` asserts that policy against the real client and
 *   not through anything rendered here.
 * - `refetchInterval: false`, so no timer outlives the test that started it.
 * - `staleTime: Infinity`, so a re-render cannot silently refetch and turn an
 *   assertion about one request into one about two.
 *
 * What is under test here is the app's behaviour, not the client's schedule. The
 * schedule is tested directly, where it is configured.
 */
export function renderWithQuery(
  ui: ReactNode,
  options: RenderWithQueryOptions = {},
): RenderResult & { queryClient: QueryClient } {
  // The shipped client, with its schedule replaced. Built by createQueryClient
  // rather than from scratch because the caches it installs carry behaviour the
  // app depends on — a 401 from anything records that nobody is logged in — and a
  // hand-built client silently has none of it. Only the *policies* are overridden,
  // which is the part of this that is about keeping a test fast rather than about
  // what the app does.
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({
    queries: { retry: false, refetchInterval: false, staleTime: Infinity },
    mutations: { retry: false },
  })

  // Seeded before the first render rather than after it. A component that decides
  // what to show from the role decides it on the way in, and a session written
  // afterwards would be a second render the test is not looking at.
  if (options.session !== undefined) {
    queryClient.setQueryData(sessionKeys.current, options.session)
  }

  const rendered = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

  return {
    queryClient,
    ...rendered,
    // Re-wrapped. Testing Library's own `rerender` replaces the whole tree with
    // what it is given, provider included, so handing it a bare element drops the
    // client and the component throws where it asks for one. Re-rendering with a
    // new prop is how a panel hands a row what a completed read said, so this has
    // to be usable.
    rerender: (next: ReactNode) => {
      rendered.rerender(<QueryClientProvider client={queryClient}>{next}</QueryClientProvider>)
    },
  }
}
