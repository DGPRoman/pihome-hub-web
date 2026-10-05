import { useId } from 'react'

import { useAndroidApp } from '../hooks/useAndroidApp'
import { useJoin, useSession } from '../hooks/useSession'
import { APK_PATH, appLink, isAndroid, megabytes } from '../lib/androidApp'
import { JOIN_PATH } from '../lib/join'
import buttons from '../styles/button.module.css'

import styles from './JoinPage.module.css'

interface JoinPageProps {
  /** What the address carried after `#`, or `null` if it carried nothing. */
  readonly token: string | null
  /** Leave for the house, whoever this browser now is. */
  readonly onDone: () => void
  /** Who is asking, for whether to offer the Android app. The browser's own by default. */
  readonly userAgent?: string
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
export function JoinPage({ token, onDone, userAgent = navigator.userAgent }: JoinPageProps) {
  const session = useSession()
  const join = useJoin()
  const headingId = useId()
  const onAndroid = token !== null && isAndroid(userAgent)

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

          {onAndroid && !refused && <AndroidApp token={token} />}

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
              {join.isPending ? 'Joining…' : onAndroid ? 'Join in this browser' : 'Join'}
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

/**
 * On Android, the pihome app first: it opens the invitation, or, when it is not
 * installed, Chrome follows the link's fallback and downloads it from this hub.
 * Joining in the browser stays below, for whoever would rather.
 */
function AndroidApp({ token }: { readonly token: string }) {
  const app = useAndroidApp()
  const origin = window.location.origin
  const offered = app.data ?? null
  // Without an APK to fall back to, back to this same invitation in the browser,
  // rather than to a store the app is not in.
  const fallback = offered === null ? `${origin}${JOIN_PATH}#${token}` : `${origin}${APK_PATH}`

  return (
    <div className={styles.app}>
      <a className={`${buttons.button} ${buttons.primary}`} href={appLink(origin, token, fallback)}>
        Open in the pihome app
      </a>
      {offered !== null && (
        <>
          <p className={styles.text}>
            Not installed yet?{' '}
            <a href={APK_PATH} download="pihome.apk">
              Download the app
            </a>{' '}
            ({megabytes(offered.size)}) from this hub. Your browser asks once whether it may install
            apps: allow it, install, then come back here and press Open in the pihome app.
          </p>
          <p className={styles.note}>
            SHA-256 <code className={styles.checksum}>{offered.sha256}</code>
          </p>
        </>
      )}
    </div>
  )
}
