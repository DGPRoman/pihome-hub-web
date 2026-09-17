import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { HubError } from '../api/errors'
import { setAllRelays } from '../api/relays'
import type { Relay } from '../api/types'
import { relayKeys } from './queryKeys'

/** What `onMutate` hands to `onError` so a failure can be undone. */
interface Rollback {
  /** Each relay's state before the write, by id. */
  readonly previous: ReadonlyMap<string, boolean>

  /** What this mutation wrote, so a rollback can recognise its own handiwork. */
  readonly wrote: boolean
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

      const current = queryClient.getQueryData<readonly Relay[]>(relayKeys.all)
      const previous = new Map(current?.map((relay) => [relay.id, relay.on]) ?? [])

      queryClient.setQueryData<readonly Relay[]>(relayKeys.all, (list) =>
        list?.map((relay) => ({ ...relay, on })),
      )

      return { previous, wrote: on }
    },

    onError: (_error, _on, context) => {
      if (context === undefined) {
        return
      }
      const { previous, wrote } = context

      // Per relay, and only where the cache still holds what this mutation put
      // there. Restoring the collection wholesale reinstated whatever another
      // in-flight write had optimistically written before this one snapshotted
      // it, which is how two overlapping failures settled on a combination the
      // hub never reported. A partial failure remains the hub's to report; the
      // client still does not guess which half moved.
      queryClient.setQueryData<readonly Relay[]>(relayKeys.all, (list) =>
        list?.map((relay) => {
          const before = previous.get(relay.id)
          return before !== undefined && relay.on === wrote ? { ...relay, on: before } : relay
        }),
      )
    },

    // Not returned: see useSetRelay.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: relayKeys.all })
    },
  })
}
