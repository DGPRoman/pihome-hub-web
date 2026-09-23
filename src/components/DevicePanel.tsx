import { useDevices } from '../hooks/useDevices'

import { DataPanel } from './DataPanel'
import { DeviceList } from './DeviceList'

/**
 * The device section: read-only, because the route is.
 *
 * Which devices exist is declared in a file on the hub, and where each one is
 * comes from the device announcing it. Neither is something this page could
 * change even if it wanted to, so there is nothing here to press.
 */
export function DevicePanel() {
  const devices = useDevices()

  return (
    <DataPanel
      heading="Devices"
      query={devices}
      loadingMessage="Reading device state…"
      emptyMessage="No devices are declared on the hub."
      isEmpty={(list) => list.length === 0}
    >
      {(list) => (
        // Measured from when this data was fetched rather than from the clock at
        // render, which keeps the render a pure function of its inputs and is the
        // more honest reading: the snapshot is from then.
        <DeviceList devices={list} asOf={new Date(devices.dataUpdatedAt)} />
      )}
    </DataPanel>
  )
}
