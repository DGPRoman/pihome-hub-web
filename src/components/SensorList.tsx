import type { Sensor } from '../api/types'

import styles from './SensorList.module.css'
import { SensorRow } from './SensorRow'

interface SensorListProps {
  readonly sensors: readonly Sensor[]
  /** When these readings were fetched, shared by every row so they agree. */
  readonly asOf: Date
}

/** The sensors, as a list. */
export function SensorList({ sensors, asOf }: SensorListProps) {
  return (
    <ul className={styles.list}>
      {sensors.map((sensor) => (
        <SensorRow key={sensor.id} sensor={sensor} asOf={asOf} />
      ))}
    </ul>
  )
}
