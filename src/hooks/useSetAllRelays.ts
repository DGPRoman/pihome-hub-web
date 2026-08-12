import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { HubError } from '../api/errors'
import { setAllRelays } from '../api/relays'
import type { Relay } from '../api/types'
import { relayKeys } from './queryKeys'

/** What `onMutate` hands to `onError` so a failure can be undone. */
interface Rollback {
  readonly previous: readonly Relay[] | undefined
}

/**
 * Drive every relay to one state, showing the result before the hub confirms it.
 *
 * Deliberately not folded into `useSetRelay`: this one belongs to the panel, and a
 * row's mutation must stay its own so a pending write greys out one switch rather
 * than all of them. The callbacks below work the way that hook explains.
 */
export function useSetAllRelays() {
  const queryClient = useQueryClient()

  return useMutation<readonly Relay[], HubError, boolean, Rollback>({
    mutationFn: (on) => setAllRelays(on),

    onMutate: async (on) => {
      await queryClient.cancelQueries({ queryKey: relayKeys.all })
      const previous = queryClient.getQueryData<readonly Relay[]>(relayKeys.all)

      queryClient.setQueryData<readonly Relay[]>(relayKeys.all, (current) =>
        current?.map((relay) => ({ ...relay, on })),
      )

      return { previous }
    },

    onError: (_error, _on, context) => {
      // The whole snapshot, because the whole list was overwritten. A partial
      // failure is the hub's to report; the client does not guess which half moved.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(relayKeys.all, context.previous)
      }
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey: relayKeys.all }),
  })
}
