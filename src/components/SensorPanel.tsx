import { useSensors } from '../hooks/useSensors'

import { DataPanel } from './DataPanel'
import { SensorList } from './SensorList'

/** The sensor section: read-only, since devices push readings rather than the page. */
export function SensorPanel() {
  const sensors = useSensors()

  return (
    <DataPanel
      heading="Sensors"
      query={sensors}
      loadingMessage="Reading sensor state…"
      emptyMessage="No sensors are configured on the hub."
      isEmpty={(list) => list.length === 0}
    >
      {(list) => (
        // Relative times are measured from when this data was fetched, not from
        // the clock at render. That keeps the render a pure function of its
        // inputs, and is the more honest reading anyway: the snapshot is from
        // then, so "4 minutes ago" means four minutes before it was taken.
        <SensorList sensors={list} asOf={new Date(sensors.dataUpdatedAt)} />
      )}
    </DataPanel>
  )
}
