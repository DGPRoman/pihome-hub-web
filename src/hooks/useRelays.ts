import { useQuery } from '@tanstack/react-query'

import { fetchRelays } from '../api/relays'
import { relayKeys } from './queryKeys'

/**
 * Read the hub's relays, kept fresh in the background.
 *
 * The `signal` arrives from the query itself: TanStack Query creates an
 * `AbortController` per attempt and aborts it when the component unmounts or the
 * key changes, which is the cleanup the previous hand-written version had to do
 * for itself. Polling and retry policy are set on the client — see queryClient.
 */
export function useRelays() {
  return useQuery({
    queryKey: relayKeys.all,
    queryFn: ({ signal }) => fetchRelays(signal),
  })
}
