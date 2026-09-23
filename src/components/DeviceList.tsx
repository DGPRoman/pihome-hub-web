import type { Device } from '../api/types'

import styles from '../styles/list.module.css'

import { DeviceRow } from './DeviceRow'

interface DeviceListProps {
  readonly devices: readonly Device[]
  /** When these snapshots were fetched, shared by every row so they agree. */
  readonly asOf: Date
}

/** The devices, as a list. */
export function DeviceList({ devices, asOf }: DeviceListProps) {
  return (
    <ul className={styles.list}>
      {devices.map((device) => (
        <DeviceRow key={device.id} device={device} asOf={asOf} />
      ))}
    </ul>
  )
}
