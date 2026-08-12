import type { Relay } from '../api/types'
import { useSetAllRelays } from '../hooks/useSetAllRelays'

import styles from './AllOffButton.module.css'

interface AllOffButtonProps {
  readonly relays: readonly Relay[]
}

/**
 * Opens every relay at once — the control for leaving the house.
 *
 * There is no "all on" beside it. The hub takes either state, but one button that
 * closes every mains circuit in the house serves no moment anyone actually has,
 * while turning everything off on the way out is the whole reason this exists.
 * Asymmetry is the point: the reachable bulk action is the safe direction.
 */
export function AllOffButton({ relays }: AllOffButtonProps) {
  const setAll = useSetAllRelays()
  const anythingOn = relays.some((relay) => relay.on)

  return (
    <>
      <button
        type="button"
        className={styles.control}
        // Nothing on means nothing to do. The request would be harmless — naming
        // the state makes it idempotent — but a button that stays live while it
        // cannot change anything teaches people to distrust it.
        disabled={!anythingOn || setAll.isPending}
        aria-busy={setAll.isPending}
        onClick={() => {
          setAll.mutate(false)
        }}
      >
        All off
      </button>

      {setAll.isError && (
        <p className={styles.error} role="alert">
          {setAll.error.message}
        </p>
      )}
    </>
  )
}
