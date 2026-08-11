import type { Relay } from '../api/types'
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

  return (
    <li className={styles.row}>
      <button
        type="button"
        // `role="switch"` with `aria-checked` is what makes this announce as a
        // switch that is on or off. The visible On/Off text says the same thing
        // for everyone else and is hidden from assistive technology, so the state
        // is not read out twice.
        role="switch"
        aria-checked={relay.on}
        aria-busy={setRelay.isPending}
        className={styles.control}
        disabled={setRelay.isPending}
        onClick={() => {
          // The desired state, not a toggle: see setRelay in the API layer.
          setRelay.mutate({ id: relay.id, on: !relay.on })
        }}
      >
        <span className={styles.label}>{relay.label}</span>
        <span className={relay.on ? styles.stateOn : styles.stateOff} aria-hidden="true">
          <span className={styles.dot} />
          {relay.on ? 'On' : 'Off'}
        </span>
      </button>

      {setRelay.isError && (
        <p className={styles.error} role="alert">
          {setRelay.error.message}
        </p>
      )}
    </li>
  )
}
