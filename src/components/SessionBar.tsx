import type { Session } from '../api/types'
import { useLogOut } from '../hooks/useSession'

import styles from './SessionBar.module.css'

interface SessionBarProps {
  readonly session: Session
}

/** Who you are, and the way out. */
export function SessionBar({ session }: SessionBarProps) {
  const logOut = useLogOut()

  return (
    <div className={styles.bar}>
      <span className={styles.who}>
        {session.username}
        {/* The role is shown because it decides what the rest of the page will
            let you do. Somebody refused a switch should be able to see why on
            the same screen rather than reading a 403 they never asked for. */}
        <span className={styles.role}>{session.role}</span>
      </span>
      <button
        type="button"
        className={styles.logout}
        disabled={logOut.isPending}
        aria-busy={logOut.isPending}
        onClick={() => {
          logOut.mutate()
        }}
      >
        Log out
      </button>
    </div>
  )
}
