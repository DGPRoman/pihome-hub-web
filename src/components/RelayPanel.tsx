import { useId } from 'react'

import { useMayChangeTheHouse } from '../hooks/useMayChangeTheHouse'
import { useRelays } from '../hooks/useRelays'
import { CANNOT_CHANGE_THE_HOUSE } from '../lib/roles'

import { AllOffButton } from './AllOffButton'
import { DataPanel } from './DataPanel'
import { RelayList } from './RelayList'

import styles from './RelayPanel.module.css'

/** The relay section: reads the hub, and shows whatever came of that. */
export function RelayPanel() {
  const relays = useRelays()
  const mayChange = useMayChangeTheHouse()
  const reasonId = useId()

  // Said once for the whole section rather than once per row. Every switch points
  // at this same element with aria-describedby, so somebody arriving at the third
  // one by keyboard hears the reason without it having been repeated five times
  // to everybody reading down the page.
  const describedBy = mayChange ? null : reasonId

  return (
    <DataPanel
      heading="Relays"
      query={relays}
      loadingMessage="Reading relay state…"
      emptyMessage="No relays are configured on the hub."
      isEmpty={(list) => list.length === 0}
      // Offered only once the hub has said what there is to switch off. Before
      // that the button could not say whether it had anything to do.
      action={
        relays.data === undefined ? null : (
          <AllOffButton relays={relays.data} describedBy={describedBy} />
        )
      }
    >
      {(list) => (
        <>
          {/* Shown, not hidden. A control that disappears for a viewer says the
              feature does not exist; one that is visible and says why it is
              unavailable says what to go and ask for. */}
          {describedBy !== null && (
            <p className={styles.readOnly} id={describedBy}>
              {CANNOT_CHANGE_THE_HOUSE}
            </p>
          )}
          <RelayList relays={list} describedBy={describedBy} />
        </>
      )}
    </DataPanel>
  )
}
