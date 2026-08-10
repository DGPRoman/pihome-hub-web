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
