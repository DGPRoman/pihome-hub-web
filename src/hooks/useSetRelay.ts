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
  /** This relay's state before the write, or undefined if it was not in the cache. */
  readonly previous: boolean | undefined

  /** What this mutation wrote, so a rollback can recognise its own handiwork. */
  readonly wrote: boolean
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

      // One relay's state, not the whole collection. A snapshot of the list would
      // also capture whatever another in-flight write had optimistically put
      // there, and restoring it later would reinstate that write's guess.
      const previous = queryClient
        .getQueryData<readonly Relay[]>(relayKeys.all)
        ?.find((relay) => relay.id === id)?.on

      queryClient.setQueryData<readonly Relay[]>(relayKeys.all, (current) =>
        current?.map((relay) => (relay.id === id ? { ...relay, on } : relay)),
      )

      // Returned as context, not stashed in a variable outside: several rows can
      // be mid-flight at once, and each needs its own snapshot to undo.
      return { previous, wrote: on }
    },

    onError: (_error, { id }, context) => {
      if (context?.previous === undefined) {
        return
      }
      const { previous, wrote } = context

      // Undone only where the cache still holds what this mutation put there.
      // Anything else means something spoke more recently — a reconciling read,
      // or another write — and its value is better than this one's memory of the
      // past. Writing the snapshot back unconditionally is how two overlapping
      // failures used to settle on a combination the hub never reported.
      queryClient.setQueryData<readonly Relay[]>(relayKeys.all, (current) =>
        current?.map((relay) =>
          relay.id === id && relay.on === wrote ? { ...relay, on: previous } : relay,
        ),
      )
    },

    // Reconcile with the hub either way. On success the optimistic value is
    // probably right but is still a guess; on failure the rollback restored a
    // value that may itself be stale.
    //
    // Deliberately not returned. The mutation core awaits whatever `onSettled`
    // gives back before dispatching the terminal state, so returning this left
    // `isError` and `isPending` stale for the whole duration of the follow-up
    // read — a switch that stayed disabled and silent long after the hub had
    // refused it, and indefinitely against a hub that stalls.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: relayKeys.all })
    },
  })
}
