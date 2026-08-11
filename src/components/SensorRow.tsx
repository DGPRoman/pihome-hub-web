import type { Sensor } from '../api/types'
import { formatRelativeTime } from '../lib/time'

import styles from './SensorRow.module.css'

// Built once at module scope; one decimal is as much as any of these sensors
// meaningfully resolves.
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

interface SensorRowProps {
  readonly sensor: Sensor
  /** When the displayed reading was fetched. Relative times are measured from here. */
  readonly asOf: Date
}

/**
 * One sensor device and its latest reading.
 *
 * Three states, kept distinct: a device that has never reported, one whose last
 * reading is too old to trust, and one that is current. Collapsing the first two
 * would make an unplugged sensor look like a quiet room.
 */
export function SensorRow({ sensor, asOf }: SensorRowProps) {
  return (
    <li className={styles.row}>
      <div className={styles.header}>
        <span className={styles.label}>{sensor.label}</span>
        {sensor.stale && sensor.lastSeen !== null && <span className={styles.badge}>Stale</span>}
      </div>

      {sensor.lastSeen === null ? (
        <p className={styles.note}>No readings yet.</p>
      ) : (
        <>
          <dl className={styles.readings}>
            {sensor.motion !== null && (
              <>
                <dt className={styles.term}>Motion</dt>
                <dd className={styles.value}>{sensor.motion ? 'Detected' : 'Clear'}</dd>
              </>
            )}
            {sensor.temperature !== null && (
              <>
                <dt className={styles.term}>Temperature</dt>
                <dd className={styles.value}>{decimal.format(sensor.temperature)} °C</dd>
              </>
            )}
            {sensor.humidity !== null && (
              <>
                <dt className={styles.term}>Humidity</dt>
                <dd className={styles.value}>{decimal.format(sensor.humidity)}%</dd>
              </>
            )}
          </dl>

          <p className={styles.note}>
            {/* The machine-readable instant sits in `dateTime`, so the words can
                be as loose as a person needs without losing the exact time. */}
            Last seen{' '}
            <time dateTime={sensor.lastSeen.toISOString()}>
              {formatRelativeTime(sensor.lastSeen, asOf)}
            </time>
          </p>
        </>
      )}
    </li>
  )
}
