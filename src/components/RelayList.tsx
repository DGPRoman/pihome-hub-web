import type { Relay } from '../api/types'

import styles from './RelayList.module.css'

interface RelayListProps {
  readonly relays: readonly Relay[]
}

/**
 * The relays, as a list.
 *
 * Presentational on purpose: it takes relays and renders them, with no idea that
 * a network exists. That is what makes it straightforward to test and, in the
 * next phase, to reuse under a version that can switch them.
 */
export function RelayList({ relays }: RelayListProps) {
  return (
    <ul className={styles.list}>
      {relays.map((relay) => (
        // `key` lets React match a relay to its DOM node across renders. The id
        // is stable and comes from the hub; an array index would not survive
        // the list being reordered or filtered.
        <li key={relay.id} className={styles.row}>
          <span className={styles.label}>{relay.label}</span>
          <span className={relay.on ? styles.stateOn : styles.stateOff}>
            {/* The dot is decorative: it repeats what the text already says, so
                it is hidden rather than announced twice. State is never carried
                by colour alone. */}
            <span className={styles.dot} aria-hidden="true" />
            {relay.on ? 'On' : 'Off'}
          </span>
        </li>
      ))}
    </ul>
  )
}
