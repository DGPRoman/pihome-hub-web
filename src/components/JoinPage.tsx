import { useId } from 'react'

import { useJoin, useSession } from '../hooks/useSession'
import buttons from '../styles/button.module.css'

import styles from './JoinPage.module.css'

interface JoinPageProps {
  /** What the address carried after `#`, or `null` if it carried nothing. */
  readonly token: string | null
  /** Leave for the house, whoever this browser now is. */
  readonly onDone: () => void
}

/**
 * Where an invitation link lands.
 *
 * Opening it does nothing. Messaging apps fetch every link they are sent to draw a
 * preview, and a page that redeemed on load would have its token spent by that
 * fetch before the person it was for ever saw it. The button is the redemption.
 *
 * It cannot say which account it opens before it does: the hub has no way to look
 * an invitation up without spending it, on purpose, so the answer arrives with the
 * session — and the bar at the top of the house says who this browser now is.
 */
export function JoinPage({ token, onDone }: JoinPageProps) {
  const session = useSession()
  const join = useJoin()
  const headingId = useId()

  // The hub refused the token itself. It is spent or was never good, and pressing
  // again would be another failure counted against this browser for nothing. Any
  // other failure — the hub not answering, a limit — left it as it was.
  const refused =
    join.isError && (join.error.kind === 'unauthorized' || join.error.kind === 'malformed')

  return (
    <section className={styles.page} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        Join this hub
      </h2>

      {token === null ? (
        <>
          {/* The common way here is a reload: the token is taken out of the
              address as soon as it is read, so it is not left in the bar. */}
          <p className={styles.text}>
            There is no invitation in this address. Open the link you were sent again — this page
            takes it out of the address bar once it has read it. If the link does not work either,
            ask whoever sent it for a new one.
          </p>
          <button type="button" className={buttons.button} onClick={onDone}>
            Go to the hub
          </button>
        </>
      ) : (
        <>
          <p className={styles.text}>
            This invitation logs this browser into an account on the hub. It works once: after that,
            this browser stays logged in, and the link opens nothing.
          </p>

          {session.data !== null && session.data !== undefined && (
            <p className={styles.note}>
              This browser is logged in as {session.data.username}. Joining logs it in as the
              invited account instead.
            </p>
          )}

          {refused ? (
            <button type="button" className={buttons.button} onClick={onDone}>
              Go to the hub
            </button>
          ) : (
            <button
              type="button"
              className={`${buttons.button} ${buttons.primary}`}
              aria-disabled={join.isPending}
              aria-busy={join.isPending}
              onClick={() => {
                if (!join.isPending) {
                  join.mutate(token, { onSuccess: onDone })
                }
              }}
            >
              {join.isPending ? 'Joining…' : 'Join'}
            </button>
          )}

          {join.isError && (
            <p className={styles.error} role="alert">
              {join.error.message}
            </p>
          )}
        </>
      )}
    </section>
  )
}
