import type { Device } from '../api/types'
import { formatStateValue, hasReading, standingOf } from '../lib/devices'
import { formatRelativeTime } from '../lib/time'

import styles from './DeviceRow.module.css'

interface DeviceRowProps {
  readonly device: Device
  /** When this snapshot was fetched. Relative times are measured from here. */
  readonly asOf: Date
}

/**
 * One device: where the hub thinks it is, and what it last said.
 *
 * The four standings are not four shades of the same thing. Three of them are
 * ordinary and one is a fault, and a row that rendered them alike would put a
 * device nobody has plugged in next to one that died an hour ago and give a
 * reader no way to tell which was which.
 */
export function DeviceRow({ device, asOf }: DeviceRowProps) {
  const standing = standingOf(device)

  return (
    <li className={styles.row}>
      <div className={styles.header}>
        <span className={styles.label}>{device.label}</span>
        {standing === 'silent' && <span className={styles.fault}>Not answering</span>}
        {standing === 'never-announced' && <span className={styles.badge}>Never announced</span>}
        {standing === 'never-polled' && <span className={styles.badge}>Not polled yet</span>}
      </div>

      {standing === 'never-announced' ? (
        // The most interesting row in the list, not one to leave out. It says the
        // hub is configured and the device has never reached it, which is a thing
        // to go and look at rather than an absence.
        <p className={styles.note}>
          Declared on the hub, and it has never said where it is. Either nothing has been powered on
          at that end, or it cannot reach the hub.
        </p>
      ) : (
        <p className={styles.note}>
          {device.address}
          {device.firmware !== null && ` · ${device.firmware}`}
          {device.announcedAt !== null &&
            ` · announced ${formatRelativeTime(device.announcedAt, asOf)}`}
        </p>
      )}

      {standing === 'silent' && (
        <p className={styles.error}>
          {device.unreachableSince === null
            ? 'The hub could not reach it.'
            : `Silent since ${formatRelativeTime(device.unreachableSince, asOf)}.`}
          {device.lastError !== null && ` ${device.lastError}`}
        </p>
      )}

      {hasReading(device) && (
        <>
          <dl className={styles.readings}>
            {Object.entries(device.state ?? {}).map(([field, value]) => (
              <div className={styles.pair} key={field}>
                {/* The device's own field names, not renamed. What they mean is
                    the device's contract to state, and a prettier name invented
                    here would be one this client had to keep in step with it. */}
                <dt className={styles.term}>{field}</dt>
                <dd className={styles.value}>{formatStateValue(value)}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.note}>
            {/* Shown with its age rather than as current, and shown at all rather
                than hidden: the hub keeps the last reading across a failed poll
                precisely so this can say what the device said and when. */}
            {standing === 'silent' ? 'Last answered ' : 'As of '}
            {device.lastSeenAt === null
              ? 'an unknown time ago'
              : formatRelativeTime(device.lastSeenAt, asOf)}
          </p>
        </>
      )}
    </li>
  )
}
