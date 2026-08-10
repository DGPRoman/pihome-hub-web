import type { Relay } from '../api/types'
import { useRelays, type Async } from '../hooks/useRelays'

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
      <PanelBody state={relays} />
    </section>
  )
}

function PanelBody({ state }: { readonly state: Async<readonly Relay[]> }) {
  switch (state.status) {
    case 'loading':
      // role="status" announces this politely, without interrupting; role="alert"
      // below interrupts, which a failure has earned and a spinner has not.
      return (
        <p className={styles.note} role="status">
          Reading relay state…
        </p>
      )

    case 'failure':
      return (
        <p className={styles.error} role="alert">
          {state.error.message}
        </p>
      )

    case 'success':
      return state.data.length === 0 ? (
        <p className={styles.note}>No relays are configured on the hub.</p>
      ) : (
        <RelayList relays={state.data} />
      )

    default: {
      // Unreachable while `Async` has exactly the three variants above — and
      // that is the point. Add a fourth and this assignment stops compiling,
      // here and at every other switch over the same union, which is a better
      // reminder than a runtime fallback that silently renders nothing.
      const unhandled: never = state
      return unhandled
    }
  }
}
