import { useState } from 'react'

import type { Account } from '../api/types'
import { useChangeAccount, useDeleteAccount, useRevokeInvitation } from '../hooks/useAccounts'
import { isManagedRole, MANAGED_ON_THE_CONSOLE } from '../lib/roles'
import { formatClockTime } from '../lib/time'
import buttons from '../styles/button.module.css'

import styles from './PersonRow.module.css'

interface PersonRowProps {
  readonly account: Account
  /** The panel issues invitations, because it is the panel that shows them. */
  readonly onInvite: (username: string) => void
  readonly inviting: boolean
}

/**
 * One account, and what an admin may do to it from here.
 *
 * Each row owns its writes, as each relay row does, so that changing one account
 * leaves every other row's buttons alone. Inviting is the exception — see
 * PeoplePanel.
 */
export function PersonRow({ account, onInvite, inviting }: PersonRowProps) {
  const change = useChangeAccount()
  const remove = useDeleteAccount()
  const revoke = useRevokeInvitation()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const { username } = account
  const busy = change.isPending || remove.isPending || revoke.isPending
  const failure = change.error ?? remove.error ?? revoke.error

  return (
    <li className={styles.row}>
      <div className={styles.summary}>
        <span className={styles.name}>{username}</span>
        <span className={styles.badge}>{account.role}</span>
        {account.disabled && <span className={styles.disabled}>disabled</span>}
        {account.invitationExpiresAt !== null && (
          <span className={styles.status}>
            invitation open until {formatClockTime(account.invitationExpiresAt)}
          </span>
        )}
      </div>

      {isManagedRole(account.role) ? (
        confirmingDelete ? (
          // Asked in place rather than in a browser dialog, so the question is
          // read where the button was and nothing else on the page is blocked.
          <div className={styles.actions} role="group" aria-label={`Delete ${username}?`}>
            <span className={styles.question}>
              Delete {username}? Any device logged in as {username} is logged out.
            </span>
            <button
              type="button"
              className={`${buttons.button} ${buttons.danger}`}
              aria-disabled={busy}
              aria-busy={remove.isPending}
              onClick={() => {
                if (!busy) {
                  remove.mutate(username)
                }
              }}
            >
              {remove.isPending ? 'Deleting…' : `Delete ${username}`}
            </button>
            <button
              type="button"
              className={buttons.button}
              onClick={() => {
                setConfirmingDelete(false)
              }}
            >
              Keep
            </button>
          </div>
        ) : (
          <div className={styles.actions} role="group" aria-label={`Manage ${username}`}>
            {/* An action named for what it does rather than a role picker: with
                two roles to choose from, a picker is a control that can only ever
                be set to the other one. */}
            <button
              type="button"
              className={buttons.button}
              aria-disabled={busy}
              onClick={() => {
                if (!busy) {
                  const role = account.role === 'viewer' ? 'operator' : 'viewer'
                  change.mutate({ username, change: { role } })
                }
              }}
            >
              {account.role === 'viewer' ? 'Make operator' : 'Make viewer'}
            </button>
            <button
              type="button"
              className={buttons.button}
              aria-disabled={busy}
              onClick={() => {
                if (!busy) {
                  change.mutate({ username, change: { disabled: !account.disabled } })
                }
              }}
            >
              {account.disabled ? 'Enable' : 'Disable'}
            </button>
            {/* Not offered for a disabled account: the hub refuses it, and the
                badge above already says why. */}
            {!account.disabled && (
              <button
                type="button"
                className={buttons.button}
                aria-disabled={inviting}
                aria-busy={inviting}
                onClick={() => {
                  if (!inviting) {
                    onInvite(username)
                  }
                }}
              >
                {inviting
                  ? 'Inviting…'
                  : account.invitationExpiresAt === null
                    ? 'Invite'
                    : 'New invitation'}
              </button>
            )}
            {account.invitationExpiresAt !== null && (
              <button
                type="button"
                className={buttons.button}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) {
                    revoke.mutate(username)
                  }
                }}
              >
                Withdraw invitation
              </button>
            )}
            <button
              type="button"
              className={`${buttons.button} ${buttons.danger}`}
              onClick={() => {
                setConfirmingDelete(true)
              }}
            >
              Delete
            </button>
          </div>
        )
      ) : (
        <p className={styles.note}>{MANAGED_ON_THE_CONSOLE}</p>
      )}

      {failure !== null && (
        <p className={styles.error} role="alert">
          {failure.message}
        </p>
      )}
    </li>
  )
}
