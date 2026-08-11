import { useRelays } from '../hooks/useRelays'

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
    >
      {(list) => <RelayList relays={list} />}
    </DataPanel>
  )
}
