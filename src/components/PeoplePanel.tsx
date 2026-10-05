import { useState } from 'react'

import type { Account, Invitation } from '../api/types'
import { useAccounts, useIssueInvitation } from '../hooks/useAccounts'
import { invitationLink, namesOnlyThisDevice } from '../lib/join'
import listStyles from '../styles/list.module.css'

import { AddPersonForm } from './AddPersonForm'
import { DataPanel } from './DataPanel'
import { InvitationCard } from './InvitationCard'
import styles from './PeoplePanel.module.css'
import { PersonRow } from './PersonRow'

/** The invitation on screen, and who it is for. */
interface Shown {
  readonly username: string
  readonly invitation: Invitation
  /**
   * When the hub confirmed it. A list read after this that no longer has it means
   * it stopped working; one read before says nothing either way.
   */
  readonly issuedAt: number
}

/**
 * Who can get into the house, for an admin: every account, and a way to add one.
 *
 * Rendered only for an admin, and so asked for only by one — see `mayManagePeople`.
 */
export function PeoplePanel() {
  const accounts = useAccounts()
  // One for the whole section rather than one per row, because one invitation is
  // shown at a time: issuing another replaces the card, as it replaces the token on
  // the hub.
  const issue = useIssueInvitation()
  // The token is held here, once. Taken out of the mutation as it arrives and the
  // mutation reset, so that closing the card is the whole of letting go of it — and
  // so the card stays up, with its own token, while another is being issued.
  const [shown, setShown] = useState<Shown | null>(null)

  const invite = (username: string) => {
    issue.mutate(username, {
      onSuccess: (invitation) => {
        setShown({ username, invitation, issuedAt: Date.now() })
        issue.reset()
      },
    })
  }

  return (
    <DataPanel
      heading="People"
      query={accounts}
      loadingMessage="Reading the accounts…"
      // Never seen in practice: the admin reading this has an account.
      emptyMessage="The hub has no accounts."
      isEmpty={(list) => list.length === 0}
    >
      {(list) => (
        <>
          {shown !== null && (
            <InvitationCard
              // Keyed by the token, so a new invitation starts a fresh card
              // rather than inheriting the last one's copy and withdraw state.
              key={shown.invitation.token}
              username={shown.username}
              invitation={shown.invitation}
              link={invitationLink(window.location.origin, shown.invitation.token)}
              gone={
                accounts.dataUpdatedAt > shown.issuedAt &&
                !stillListed(list, shown.username, shown.invitation)
              }
              namesOnlyThisDevice={namesOnlyThisDevice(window.location.hostname)}
              inviting={issue.isPending && issue.variables === shown.username}
              onInviteAgain={() => {
                invite(shown.username)
              }}
              onClose={() => {
                setShown(null)
              }}
            />
          )}
          {issue.isError && (
            <p className={styles.error} role="alert">
              Could not invite {issue.variables}: {issue.error.message}
            </p>
          )}

          <ul className={listStyles.list}>
            {list.map((account) => (
              <PersonRow
                key={account.username}
                account={account}
                onInvite={invite}
                inviting={issue.isPending && issue.variables === account.username}
              />
            ))}
          </ul>

          <AddPersonForm onCreated={invite} />
        </>
      )}
    </DataPanel>
  )
}

/**
 * Whether the hub still lists this invitation for this account.
 *
 * Compared by expiry, which is what tells this invitation from a later one issued
 * for the same account somewhere else — the token never comes back in a list. To
 * the second rather than exactly, so a difference in how two responses write the
 * fraction cannot read as a different invitation.
 */
function stillListed(
  accounts: readonly Account[],
  username: string,
  invitation: Invitation,
): boolean {
  const listed = accounts.find((account) => account.username === username)?.invitationExpiresAt
  return (
    listed !== undefined &&
    listed !== null &&
    Math.abs(listed.getTime() - invitation.expiresAt.getTime()) < 1_000
  )
}
