import type { Relay } from '../api/types'

import styles from './RelayList.module.css'
import { RelayRow } from './RelayRow'

interface RelayListProps {
  readonly relays: readonly Relay[]
}

/** The relays, as a list of switches. */
export function RelayList({ relays }: RelayListProps) {
  return (
    <ul className={styles.list}>
      {relays.map((relay) => (
        // `key` lets React match a relay to its DOM node, and to the component
        // state and in-flight mutation attached to it, across renders. The id is
        // stable and comes from the hub; an index would be reassigned the moment
        // the list is reordered, handing one row's pending switch to another.
        <RelayRow key={relay.id} relay={relay} />
      ))}
    </ul>
  )
}
