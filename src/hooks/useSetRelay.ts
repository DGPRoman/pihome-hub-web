import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { HubError } from '../api/errors'
import { setRelay } from '../api/relays'
import type { Relay } from '../api/types'
import { relayKeys } from './queryKeys'

export interface SetRelayInput {
  readonly id: string
  readonly on: boolean
}

/** What `onMutate` hands to `onError` so a failure can be undone. */
interface Rollback {
  readonly previous: readonly Relay[] | undefined
}

/**
 * Drive one relay to a state, showing the result before the hub confirms it.
 *
 * A switch that waits for a round trip feels broken, so the cache is written
 * first and corrected afterwards. The three callbacks below are what make that
 * safe rather than merely fast.
 */
export function useSetRelay() {
  const queryClient = useQueryClient()

  return useMutation<Relay, HubError, SetRelayInput, Rollback>({
    mutationFn: ({ id, on }) => setRelay(id, on),

    onMutate: async ({ id, on }) => {
      // A poll may already be in flight. Left alone, it would arrive carrying
      // the state from before this click and silently undo the optimistic write,
      // making the switch appear to spring back on its own.
      await queryClient.cancelQueries({ queryKey: relayKeys.all })

      const previous = queryClient.getQueryData<readonly Relay[]>(relayKeys.all)

      queryClient.setQueryData<readonly Relay[]>(relayKeys.all, (current) =>
        current?.map((relay) => (relay.id === id ? { ...relay, on } : relay)),
      )

      // Returned as context, not stashed in a variable outside: several rows can
      // be mid-flight at once, and each needs its own snapshot to undo.
      return { previous }
    },

    onError: (_error, _input, context) => {
      // Restore exactly what was there. Flipping the relay back instead would be
      // wrong whenever the hub had already moved it for another reason.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(relayKeys.all, context.previous)
      }
    },

    // Reconcile with the hub either way. On success the optimistic value is
    // probably right but is still a guess; on failure the rollback restored a
    // snapshot that may itself be stale. Returned rather than ignored so the
    // mutation is not settled until the list agrees with the hub again.
    onSettled: () => queryClient.invalidateQueries({ queryKey: relayKeys.all }),
  })
}
