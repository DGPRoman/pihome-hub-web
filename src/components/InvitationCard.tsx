import { useId, useRef, useState } from 'react'

import type { Invitation } from '../api/types'
import { useNow } from '../hooks/useNow'
import { useRevokeInvitation } from '../hooks/useAccounts'
import { formatClockTime, formatTimeLeft } from '../lib/time'
import buttons from '../styles/button.module.css'

import styles from './InvitationCard.module.css'
import { QrCode } from './QrCode'

interface InvitationCardProps {
  readonly username: string
  readonly invitation: Invitation
  /** The link the token travels in, built by whoever knows the address. */
  readonly link: string
  /**
   * The hub has stopped listing this invitation: it was used, or withdrawn or
   * replaced somewhere else. Either way the code below no longer opens anything.
   */
  readonly gone: boolean
  /** The link names an address only this device can reach. */
  readonly namesOnlyThisDevice: boolean
  readonly inviting: boolean
  readonly onInviteAgain: () => void
  readonly onClose: () => void
}

/**
 * One invitation, shown so it can be passed on: a code to scan and a link to send.
 *
 * Both, because either alone leaves somebody out — a laptop with no camera, a phone
 * standing next to the screen. And a countdown, because the fifteen minutes are the
 * hub's and do not stop for anybody.
 */
export function InvitationCard({
  username,
  invitation,
  link,
  gone,
  namesOnlyThisDevice,
  inviting,
  onInviteAgain,
  onClose,
}: InvitationCardProps) {
  const now = useNow(1_000)
  const revoke = useRevokeInvitation()
  const headingId = useId()
  const linkId = useId()
  const field = useRef<HTMLInputElement>(null)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'select'>('idle')

  const left = formatTimeLeft(invitation.expiresAt, now)
  const until = formatClockTime(invitation.expiresAt)

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.heading}>
        Invitation for {username}
      </h3>

      {gone ? (
        // Not "used". The hub stops listing an invitation when it is redeemed and
        // also when it is withdrawn or replaced, and it does not say which.
        <p className={styles.note}>
          This invitation has been used, or withdrawn somewhere else. The code no longer opens
          anything.
        </p>
      ) : left === null ? (
        <p className={styles.note}>
          This invitation ran out at {until}. It no longer opens anything.
        </p>
      ) : (
        <>
          <p className={styles.note}>
            Scan the code, or send the link. It logs one device into {username}&rsquo;s account,
            once — whoever opens it first gets in, so send it to {username} and nobody else.
          </p>

          {namesOnlyThisDevice && (
            // Said before the code rather than after it fails: a phone that
            // opens localhost opens itself, and the error it shows would blame
            // the invitation.
            <p className={styles.warning} role="alert">
              This page was opened as localhost, so the link only works on this device. Open the hub
              by its network address to invite somebody from it.
            </p>
          )}

          <QrCode text={link} label={`QR code for ${username}'s invitation link`} />

          <div className={styles.link}>
            <label htmlFor={linkId}>Link</label>
            <input
              id={linkId}
              ref={field}
              className={styles.linkField}
              readOnly
              value={link}
              // Selected on focus, so a long-press or Ctrl+C takes all of it.
              onFocus={(event) => {
                event.target.select()
              }}
            />
            <button
              type="button"
              className={buttons.button}
              onClick={() => {
                void copyLink(link, field.current).then((copied) => {
                  setCopy(copied ? 'copied' : 'select')
                })
              }}
            >
              Copy link
            </button>
            {/* Present from the start, so the browser is already watching it when
                there is something to say. */}
            <span className={styles.copyStatus} role="status">
              {copy === 'copied'
                ? 'Copied.'
                : copy === 'select'
                  ? 'This browser would not copy it. The link is selected — copy it from there.'
                  : ''}
            </span>
          </div>

          {/* Not a live region. It changes every second, and announcing each one
              would drown out everything else on the page. */}
          <p className={styles.countdown}>
            Works until {until} — {left} left.
          </p>
        </>
      )}

      <div className={styles.actions}>
        {gone || left === null ? (
          <button
            type="button"
            className={buttons.button}
            aria-disabled={inviting}
            aria-busy={inviting}
            onClick={() => {
              if (!inviting) {
                onInviteAgain()
              }
            }}
          >
            {inviting ? 'Inviting…' : 'New invitation'}
          </button>
        ) : (
          <button
            type="button"
            className={`${buttons.button} ${buttons.danger}`}
            aria-disabled={revoke.isPending}
            aria-busy={revoke.isPending}
            onClick={() => {
              if (!revoke.isPending) {
                revoke.mutate(username, { onSuccess: onClose })
              }
            }}
          >
            {revoke.isPending ? 'Withdrawing…' : 'Withdraw'}
          </button>
        )}
        <button type="button" className={buttons.button} onClick={onClose}>
          Done
        </button>
      </div>

      {revoke.isError && (
        <p className={styles.error} role="alert">
          {revoke.error.message}
        </p>
      )}
    </section>
  )
}

/**
 * Put the link on the clipboard, or select it so the person can.
 *
 * Two ways, because the hub is usually reached over plain HTTP on a home network
 * and the clipboard API exists only on a secure origin. The older command still
 * works there, from a click. When neither does, the link is left selected.
 */
async function copyLink(link: string, field: HTMLInputElement | null): Promise<boolean> {
  if ('clipboard' in navigator) {
    try {
      await navigator.clipboard.writeText(link)
      return true
    } catch {
      // Refused — a permission, or a page without focus. Fall through to the
      // selection, which is still something the person can copy from.
    }
  }
  field?.select()
  try {
    // Deprecated, and still the only copy there is on plain HTTP.
    return document.execCommand('copy')
  } catch {
    return false
  }
}
