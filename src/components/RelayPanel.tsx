import type { UseQueryResult } from '@tanstack/react-query'

import type { Relay } from '../api/types'
import { useRelays } from '../hooks/useRelays'

import { RelayList } from './RelayList'
import styles from './RelayPanel.module.css'

const HEADING_ID = 'relays-heading'

/** The relay section: reads the hub, and shows whatever came of that. */
export function RelayPanel() {
  const relays = useRelays()

  return (
    <section className={styles.panel} aria-labelledby={HEADING_ID}>
      <h2 id={HEADING_ID} className={styles.heading}>
        Relays
      </h2>
      <PanelBody query={relays} />
    </section>
  )
}

function PanelBody({ query }: { readonly query: UseQueryResult<readonly Relay[]> }) {
  // Data first, deliberately. A background poll that fails sets `status` to
  // 'error' while the cached relays are still sitting there, so branching on
  // status alone would blank a working list because one refresh went missing.
  // The last known state, labelled as such, is more useful than nothing.
  if (query.data !== undefined) {
    return (
      <>
        {query.isError && (
          <p className={styles.warning} role="alert">
            {query.error.message} Showing the last state the hub reported.
          </p>
        )}
        {query.data.length === 0 ? (
          <p className={styles.note}>No relays are configured on the hub.</p>
        ) : (
          <RelayList relays={query.data} />
        )}
      </>
    )
  }

  // Nothing has ever arrived, so there is nothing to fall back to.
  if (query.isError) {
    return (
      <p className={styles.error} role="alert">
        {query.error.message}
      </p>
    )
  }

  // role="status" announces politely, without interrupting; the failures above
  // use role="alert", which interrupts — a spinner has not earned that.
  return (
    <p className={styles.note} role="status">
      Reading relay state…
    </p>
  )
}
