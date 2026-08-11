import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * Render inside a fresh query client.
 *
 * Fresh per call so no cache survives between tests. The production defaults are
 * deliberately not reused: retries would make a test asserting a failure wait for
 * backoff, and the polling interval would leave timers running after the test
 * ended. What is under test is the app's behaviour, not the client's schedule.
 */
export function renderWithQuery(ui: ReactNode): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })

  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  }
}
