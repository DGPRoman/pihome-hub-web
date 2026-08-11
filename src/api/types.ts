/**
 * A relay, as the hub reports it.
 *
 * Mirrors `RelayState` in the hub's v1 schema. Readonly throughout: this is a
 * snapshot of what the Pi said, not a local model to be edited. Changing a
 * relay means asking the hub and taking its answer.
 */
export interface Relay {
  readonly id: string
  readonly label: string
  readonly on: boolean
}

/**
 * A sensor device and its latest reading, as the hub reports it.
 *
 * Mirrors `DeviceSnapshot` in the hub's v1 schema, with two changes made at the
 * boundary: field names are camelCase, and timestamps are `Date` rather than the
 * ISO strings the wire carries. Both conversions happen once, in the parser, so
 * nothing downstream deals with `last_seen` or with a string that has to be
 * remembered to be a date.
 *
 * Every reading is nullable because a configured device may never have reported.
 * The hub's own per-quantity timestamps are deliberately not modelled yet —
 * nothing displays them, and inventing fields ahead of a use for them is how a
 * type stops describing anything.
 */
/** One automation rule, as the hub reports it. Mirrors `AutomationRule` in its v1 schema. */
export interface AutomationRule {
  readonly id: string
  readonly enabled: boolean
  readonly onlyAfterDark: boolean
  readonly when: {
    readonly device: string
    readonly motion: boolean
  }
  readonly then: {
    readonly relay: string
    readonly state: 'on' | 'off'
    /** Revert after this many seconds; `null` means the state is left in place. */
    readonly holdSeconds: number | null
  }
}

export interface Sensor {
  readonly id: string
  readonly label: string
  /** True when nothing has arrived inside the device's configured window. */
  readonly stale: boolean
  /** `null` when the device has never reported at all, which is not the same as stale. */
  readonly lastSeen: Date | null
  readonly motion: boolean | null
  readonly temperature: number | null
  readonly humidity: number | null
}
