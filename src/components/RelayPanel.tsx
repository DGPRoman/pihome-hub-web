import { useRelays } from '../hooks/useRelays'

import { AllOffButton } from './AllOffButton'
import { DataPanel } from './DataPanel'
import { RelayList } from './RelayList'

/** The relay section: reads the hub, and shows whatever came of that. */
export function RelayPanel() {
  const relays = useRelays()

  return (
    <DataPanel
      heading="Relays"
      query={relays}
      loadingMessage="Reading relay state…"
      emptyMessage="No relays are configured on the hub."
      isEmpty={(list) => list.length === 0}
      // Offered only once the hub has said what there is to switch off. Before
      // that the button could not say whether it had anything to do.
      action={relays.data === undefined ? null : <AllOffButton relays={relays.data} />}
    >
      {(list) => <RelayList relays={list} />}
    </DataPanel>
  )
}
