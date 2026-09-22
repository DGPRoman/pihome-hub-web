import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'

import { createQueryClient } from '../queryClient'

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
export function renderWithQuery(ui: ReactNode): RenderResult & { queryClient: QueryClient } {
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
