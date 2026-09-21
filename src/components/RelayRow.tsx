import { useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'

import type { Relay } from '../api/types'
import { relayKeys } from '../hooks/queryKeys'
import { useSetRelay } from '../hooks/useSetRelay'

import styles from './RelayRow.module.css'

interface RelayRowProps {
  readonly relay: Relay
}

/**
 * One relay, as a switch.
 *
 * Each row owns its own mutation. That is what gives every switch an independent
 * pending state: one shared mutation would report `isPending` for all of them, so
 * flipping the porch light would grey out the gate light too.
 */
export function RelayRow({ relay }: RelayRowProps) {
  const setRelay = useSetRelay()
  const queryClient = useQueryClient()
  const noteId = useId()

  // The hub accepted the write and then answered unreadably, so what the switch
  // shows is this app's guess rather than something the hub reported. True until
  // the hub speaks again, and then false — derived from two timestamps the client
  // already keeps rather than from a flag somebody has to remember to clear. The
  // app holds no state of its own, and this is not the place to start.
  //
  // `<=` rather than `<`. Both timestamps are milliseconds, so equal means "too
  // close to order", and of the two ways to guess wrong only one of them tells
  // somebody a mains circuit is where they left it when nothing confirmed that.
  const unconfirmed =
    setRelay.isError &&
    setRelay.error.kind === 'unreadable' &&
    (queryClient.getQueryState(relayKeys.all)?.dataUpdatedAt ?? 0) <= setRelay.submittedAt

  return (
    <li className={styles.row}>
      <button
        type="button"
        // `role="switch"` with `aria-checked` is what makes this announce as a
        // switch that is on or off. The visible On/Off text says the same thing
        // for everyone else and is hidden from assistive technology, so the state
        // is not read out twice.
        role="switch"
        // Still true or false while unconfirmed. ARIA allows `mixed` on a
        // checkbox but not on a switch, so the doubt is attached as a description
        // rather than faked in the state — a switch that announced nothing at all
        // would be worse than one that announces a value with a caveat.
        aria-checked={relay.on}
        aria-busy={setRelay.isPending}
        {...(unconfirmed ? { 'aria-describedby': noteId } : {})}
        className={styles.control}
        disabled={setRelay.isPending}
        onClick={() => {
          // The desired state, not a toggle: see setRelay in the API layer.
          setRelay.mutate({ id: relay.id, on: !relay.on })
        }}
      >
        <span className={styles.label}>{relay.label}</span>
        <span
          className={
            unconfirmed ? styles.stateUnconfirmed : relay.on ? styles.stateOn : styles.stateOff
          }
          aria-hidden="true"
        >
          <span className={styles.dot} />
          {unconfirmed ? (relay.on ? 'On?' : 'Off?') : relay.on ? 'On' : 'Off'}
        </span>
      </button>

      {unconfirmed ? (
        // `status`, not `alert`. The write was applied; only the confirmation was
        // lost, and announcing that as an error would tell the operator to do
        // something about a circuit that is already where they asked for it.
        <p className={styles.unconfirmed} id={noteId} role="status">
          {setRelay.error.message} The switch may have moved — rechecking with the hub.
        </p>
      ) : (
        setRelay.isError && (
          <p className={styles.error} role="alert">
            {setRelay.error.message}
          </p>
        )
      )}
    </li>
  )
}
