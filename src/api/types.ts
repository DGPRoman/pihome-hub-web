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
 * One quantity a sensor may report, in every state it can be in.
 *
 * Four states rather than a nullable value, because the client's central claim
 * about sensors is that absent, stale and zero are different things. A single
 * `boolean | null` collapses three of these into one: a hub that does not send
 * the field at all, a device that has never reported it, and a device that
 * reported it long ago all arrive as `null` and render the same.
 */
export type Reading<T> =
  /** The field was not in the response. This hub does not report this quantity. */
  | { readonly kind: 'unsupported' }
  /** The hub sent `null`. The device is configured for it and has never sent one. */
  | { readonly kind: 'never' }
  /** A value, and the instant it was taken; `at` is null when the hub sent none. */
  | { readonly kind: 'value'; readonly value: T; readonly at: Date | null }

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

/**
 * A sensor device and its latest readings, as the hub reports it.
 *
 * Mirrors `DeviceSnapshot` in the hub's v1 schema, with two changes made at the
 * boundary: field names are camelCase, and timestamps are `Date` rather than the
 * ISO strings the wire carries. Both conversions happen once, in the parser, so
 * nothing downstream deals with `last_seen` or with a string that has to be
 * remembered to be a date.
 */
export interface Sensor {
  readonly id: string
  readonly label: string
  /**
   * True when nothing at all has arrived inside the device's configured window.
   *
   * One flag for the whole device. The hub bumps `last_seen` on any reading, so
   * this being false says something arrived recently and not which quantity —
   * which is why each reading carries its own timestamp.
   */
  readonly stale: boolean
  /**
   * The window `stale` was decided against, in seconds.
   *
   * `null` from a hub that does not send it. Without it a single reading's age
   * cannot be judged: knowing the device is not stale says the window is at
   * least as long as the newest reading is old, and nothing about how much
   * longer.
   */
  readonly staleAfterSeconds: number | null
  /** `null` when the device has never reported at all, which is not the same as stale. */
  readonly lastSeen: Date | null
  readonly motion: Reading<boolean>
  readonly temperature: Reading<number>
  readonly humidity: Reading<number>
}

/**
 * A device the hub polls, and what it last found.
 *
 * Devices and sensors are opposite halves of the same problem, and the difference
 * decides every field here: a sensor pushes, a device is polled. Because the hub
 * is the one asking, it is also the one that knows whether the answer arrived —
 * so where a sensor's freshness has to be inferred from timestamps, a device's is
 * something the hub states.
 */
export interface Device {
  readonly id: string
  readonly label: string
  /** What sort of device it is, which decides the path the hub polls. */
  readonly kind: string
  /** Where it last said it was, or `null` if it has never announced. */
  readonly address: string | null
  /** Whatever the device calls its build. Recorded by the hub, never interpreted. */
  readonly firmware: string | null
  readonly announcedAt: Date | null
  /**
   * Whether the last poll succeeded.
   *
   * `null` means never polled, which is **not** the same as polled and
   * unreachable. A device nobody has powered on yet and a device that has stopped
   * answering need different things done about them.
   */
  readonly reachable: boolean | null
  /** When the hub last asked. */
  readonly lastPolledAt: Date | null
  /** When it last answered, which is the date on `state`. */
  readonly lastSeenAt: Date | null
  /**
   * When the current run of failures began, or `null` while it is answering.
   *
   * The start of the run rather than the latest failure: one dropped packet on
   * wifi is ordinary, an hour of them is not, and only the second is worth acting
   * on.
   */
  readonly unreachableSince: Date | null
  /** Why the last poll failed, in the hub's words. */
  readonly lastError: string | null
  /**
   * The device's own status document, exactly as it served it.
   *
   * Deliberately untyped past "an object". What the fields mean is the device's
   * contract to state, not this client's — modelling them here would make every
   * field a device adds a change in two repositories instead of one.
   *
   * Kept by the hub across a failed poll, so this can be a real reading from
   * before the device went quiet. Shown with its age rather than as current.
   */
  readonly state: Readonly<Record<string, unknown>> | null
}

/**
 * What an account may do, as the hub reports it.
 *
 * A closed set, and the client decides from it rather than from a message: a
 * `viewer` is shown what it cannot do instead of being allowed to try and told
 * `403`. The hub enforces it either way — this only decides what to render.
 */
export type Role = 'admin' | 'operator' | 'viewer'

/** Who this browser is logged in as. Mirrors `SessionResponse` in the hub's v1 schema. */
export interface Session {
  readonly username: string
  readonly role: Role
  /** When the hub will stop accepting this session, whatever the browser does. */
  readonly expiresAt: Date
}
