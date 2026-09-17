import type { Reading, Sensor } from '../api/types'
import { freshnessOf } from '../lib/freshness'
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

interface QuantityProps<T> {
  readonly term: string
  readonly reading: Reading<T>
  readonly format: (value: T) => string
  readonly staleAfterSeconds: number | null
  readonly asOf: Date
}

/**
 * One quantity, with its own age and its own verdict.
 *
 * The age belongs here rather than on the row. A device reports `last_seen` for
 * the whole device, bumped by any reading, so a row-level "Last seen now" above a
 * motion reading from four hours ago says something untrue about the motion.
 */
function Quantity<T>({ term, reading, format, staleAfterSeconds, asOf }: QuantityProps<T>) {
  // Nothing at all for a quantity the hub does not report: an empty row saying
  // "this hub version has no opinion" is noise on a panel about a house.
  if (reading.kind === 'unsupported') {
    return null
  }

  const freshness = freshnessOf(reading, staleAfterSeconds, asOf)

  return (
    <>
      <dt className={styles.term}>{term}</dt>
      <dd className={styles.value}>
        {reading.kind === 'never' ? (
          // Distinct from the quantity being absent above, and from a value of
          // false: this device is configured to report it and never has.
          <span className={styles.note}>Never reported</span>
        ) : (
          <>
            {/* Wrapped so the value is one element: the age and any badge sit
                beside it, and a reader — or a test — should be able to take hold
                of the reading without them. */}
            <span className={styles.reading}>{format(reading.value)}</span>
            {freshness === 'stale' && <span className={styles.badge}>Stale</span>}
            <span className={styles.note}>
              {reading.at === null ? (
                // The value is real; only its age is missing. Discarding it — which
                // is what hiding it amounts to — loses something true.
                'age unknown'
              ) : (
                <time dateTime={reading.at.toISOString()}>
                  {formatRelativeTime(reading.at, asOf)}
                </time>
              )}
            </span>
          </>
        )}
      </dd>
    </>
  )
}

/**
 * One sensor device and its latest readings.
 *
 * Each quantity is judged on its own timestamp. The device-wide flag still has a
 * job — it is the only thing that can speak for a device that has gone entirely
 * quiet — but it cannot say whether any particular reading is current, because
 * the hub bumps `last_seen` on whichever quantity arrived.
 */
export function SensorRow({ sensor, asOf }: SensorRowProps) {
  const quantities = [sensor.motion, sensor.temperature, sensor.humidity]
  const nothingReported = quantities.every((reading) => reading.kind !== 'value')

  return (
    <li className={styles.row}>
      <div className={styles.header}>
        <span className={styles.label}>{sensor.label}</span>
        {sensor.stale && sensor.lastSeen !== null && <span className={styles.badge}>Stale</span>}
      </div>

      {sensor.lastSeen === null && nothingReported ? (
        <p className={styles.note}>No readings yet.</p>
      ) : (
        <>
          <dl className={styles.readings}>
            <Quantity
              term="Motion"
              reading={sensor.motion}
              format={(on) => (on ? 'Detected' : 'Clear')}
              staleAfterSeconds={sensor.staleAfterSeconds}
              asOf={asOf}
            />
            <Quantity
              term="Temperature"
              reading={sensor.temperature}
              format={(value) => `${decimal.format(value)} °C`}
              staleAfterSeconds={sensor.staleAfterSeconds}
              asOf={asOf}
            />
            <Quantity
              term="Humidity"
              reading={sensor.humidity}
              format={(value) => `${decimal.format(value)}%`}
              staleAfterSeconds={sensor.staleAfterSeconds}
              asOf={asOf}
            />
          </dl>

          {sensor.lastSeen !== null && (
            <p className={styles.note}>
              {/* The machine-readable instant sits in `dateTime`, so the words can
                  be as loose as a person needs without losing the exact time. */}
              Last seen{' '}
              <time dateTime={sensor.lastSeen.toISOString()}>
                {formatRelativeTime(sensor.lastSeen, asOf)}
              </time>
            </p>
          )}
        </>
      )}
    </li>
  )
}
