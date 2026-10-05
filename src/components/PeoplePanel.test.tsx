/** @vitest-environment-options {"url": "http://hub.local:5002/"} */
import type { QueryClient } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import type { Account, Invitation } from '../api/types'
import * as usersApi from '../api/users'
import { userKeys } from '../hooks/queryKeys'
import { encodeQr } from '../lib/qr'
import { MANAGED_ON_THE_CONSOLE } from '../lib/roles'
import { renderWithQuery, sessionAs } from '../testing/renderWithQuery'

import { PeoplePanel } from './PeoplePanel'

const FIFTEEN_MINUTES_MS = 15 * 60_000

function account(username: string, role: Account['role'], extra: Partial<Account> = {}): Account {
  return {
    username,
    role,
    disabled: false,
    createdAt: new Date('2026-10-01T09:00:00Z'),
    invitationExpiresAt: null,
    ...extra,
  }
}

/**
 * The hub's accounts, kept as state the stubs read and write.
 *
 * Every write here is followed by a fresh read of the list, so a stub that answered
 * the write and left the list as it was would have the row spring back to what it
 * was — a test of the stub rather than of the panel.
 */
function fakeHub(initial: readonly Account[]) {
  let accounts = [...initial]
  let issued = 0

  const find = (username: string): Account => {
    const found = accounts.find((candidate) => candidate.username === username)
    if (found === undefined) {
      throw new HubError('not-found', 'The hub has no record of that.', 404)
    }
    return found
  }
  const update = (username: string, change: Partial<Account>): Account => {
    accounts = accounts.map((candidate) =>
      candidate.username === username ? { ...candidate, ...change } : candidate,
    )
    return find(username)
  }

  const api = {
    fetchAccounts: vi
      .spyOn(usersApi, 'fetchAccounts')
      .mockImplementation(() => Promise.resolve(accounts)),
    createAccount: vi.spyOn(usersApi, 'createAccount').mockImplementation((username, role) => {
      const created = account(username, role)
      accounts = [...accounts, created]
      return Promise.resolve(created)
    }),
    changeAccount: vi
      .spyOn(usersApi, 'changeAccount')
      .mockImplementation((username, change) => Promise.resolve(update(username, change))),
    deleteAccount: vi.spyOn(usersApi, 'deleteAccount').mockImplementation((username) => {
      accounts = accounts.filter((candidate) => candidate.username !== username)
      return Promise.resolve()
    }),
    issueInvitation: vi.spyOn(usersApi, 'issueInvitation').mockImplementation((username) => {
      issued += 1
      const invitation: Invitation = {
        token: `token-${String(issued)}-${'x'.repeat(36)}`,
        expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS),
      }
      update(username, { invitationExpiresAt: invitation.expiresAt })
      return Promise.resolve(invitation)
    }),
    revokeInvitation: vi.spyOn(usersApi, 'revokeInvitation').mockImplementation((username) => {
      update(username, { invitationExpiresAt: null })
      return Promise.resolve()
    }),
  }

  return {
    api,
    /** Somebody used the invitation, somewhere this test is not looking. */
    redeem: (username: string) => {
      update(username, { invitationExpiresAt: null })
    },
  }
}

const HOUSEHOLD = [
  account('olya', 'operator'),
  account('roman', 'admin'),
  account('taras', 'viewer'),
]

/**
 * Read the list again, as the poll would, and strictly later than anything before.
 *
 * The panel judges a read by when it arrived, and the clock counts milliseconds: a
 * stubbed request can arrive in the same one as the invitation it follows, and
 * then says nothing about it. Waiting for the clock to move makes the read one that
 * counts, rather than one that counts on a slow enough machine.
 */
async function readTheListAgain(queryClient: QueryClient): Promise<void> {
  const before = Date.now()
  await vi.waitFor(() => {
    expect(Date.now()).toBeGreaterThan(before)
  })
  // Inside act, and a task past the read, so what it changes is on screen before
  // anything asserts on it. TanStack tells React about new data from a timer, not
  // when the read settles, so an assertion that the card still says one thing would
  // otherwise run before the render that makes it say another.
  await act(async () => {
    await queryClient.invalidateQueries({ queryKey: userKeys.all })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function renderPanel() {
  return renderWithQuery(<PeoplePanel />, { session: sessionAs('admin') })
}

async function rowFor(username: string): Promise<HTMLElement> {
  return screen.findByRole('group', { name: `Manage ${username}` })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PeoplePanel', () => {
  describe('the list', () => {
    it('shows every account and its role', async () => {
      fakeHub(HOUSEHOLD)

      renderPanel()
      await rowFor('olya')

      const region = screen.getByRole('region', { name: 'People' })
      for (const { username, role } of HOUSEHOLD) {
        const name = within(region).getByText(username)
        expect(name.parentElement).toHaveTextContent(role)
      }
    })

    it('offers nothing for an admin account, and says where it is managed', async () => {
      fakeHub(HOUSEHOLD)

      renderPanel()
      await rowFor('olya')

      expect(screen.queryByRole('group', { name: 'Manage roman' })).toBeNull()
      expect(screen.getByText(MANAGED_ON_THE_CONSOLE)).toBeInTheDocument()
    })

    it('says when an outstanding invitation runs out', async () => {
      fakeHub([account('olya', 'operator', { invitationExpiresAt: new Date(Date.now() + 60_000) })])

      renderPanel()

      expect(await screen.findByText(/invitation open until/)).toBeInTheDocument()
    })
  })

  describe('changing an account', () => {
    it('moves an operator to viewer, and back', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(
        within(await rowFor('olya')).getByRole('button', { name: 'Make viewer' }),
      )

      expect(hub.api.changeAccount).toHaveBeenCalledWith('olya', { role: 'viewer' })
      await userEvent.click(
        await within(await rowFor('olya')).findByRole('button', { name: 'Make operator' }),
      )
      expect(hub.api.changeAccount).toHaveBeenLastCalledWith('olya', { role: 'operator' })
    })

    it('shows the hub’s answer before the list is read again', async () => {
      // The PATCH answers with the account as it now stands, so the row has the
      // hub's word for it at once rather than a moment of the old role.
      const hub = fakeHub(HOUSEHOLD)
      const { queryClient } = renderPanel()
      await rowFor('olya')
      hub.api.fetchAccounts.mockReturnValue(
        new Promise(() => {
          // The reconciling read never arrives.
        }),
      )

      await userEvent.click(
        within(await rowFor('olya')).getByRole('button', { name: 'Make viewer' }),
      )

      await waitFor(() => {
        const cached = queryClient.getQueryData<readonly Account[]>(userKeys.all)
        expect(cached?.find((candidate) => candidate.username === 'olya')?.role).toBe('viewer')
      })
    })

    it('disables an account, after which it cannot be invited', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('taras')).getByRole('button', { name: 'Disable' }))

      expect(hub.api.changeAccount).toHaveBeenCalledWith('taras', { disabled: true })
      const row = await rowFor('taras')
      expect(await within(row).findByRole('button', { name: 'Enable' })).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'Invite' })).toBeNull()
      expect(screen.getByText('disabled')).toBeInTheDocument()
    })

    it('says what the hub said when it refuses', async () => {
      const hub = fakeHub(HOUSEHOLD)
      hub.api.changeAccount.mockRejectedValue(
        new HubError('offline', 'The hub did not answer. Is it running?'),
      )

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Disable' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('The hub did not answer')
    })
  })

  describe('deleting an account', () => {
    it('asks first, and deletes nothing when told to keep it', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Delete' }))
      const question = screen.getByRole('group', { name: 'Delete olya?' })
      expect(question).toHaveTextContent('logged out')
      await userEvent.click(within(question).getByRole('button', { name: 'Keep' }))

      expect(hub.api.deleteAccount).not.toHaveBeenCalled()
      expect(await rowFor('olya')).toBeInTheDocument()
    })

    it('deletes once confirmed, and the account leaves the list', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Delete' }))
      await userEvent.click(screen.getByRole('button', { name: 'Delete olya' }))

      expect(hub.api.deleteAccount).toHaveBeenCalledWith('olya')
      await waitFor(() => {
        expect(screen.queryByText('olya')).toBeNull()
      })
    })
  })

  describe('inviting', () => {
    it('shows a code and a link, and how long they work', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))

      const card = await screen.findByRole('region', { name: 'Invitation for olya' })
      expect(hub.api.issueInvitation).toHaveBeenCalledWith('olya')
      expect(within(card).getByRole('img', { name: /QR code/ })).toBeInTheDocument()
      // The address this page was opened at, the join path, and the token after #.
      expect(within(card).getByLabelText('Link')).toHaveValue(
        `http://hub.local:5002/join#token-1-${'x'.repeat(36)}`,
      )
      expect(card).toHaveTextContent(/15 minutes left/)
      // This page was opened by the hub's network address, so there is nothing to
      // warn about.
      expect(within(card).queryByRole('alert')).toBeNull()
    })

    it('draws the link itself into the code', async () => {
      fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))

      const code = within(
        await screen.findByRole('region', { name: 'Invitation for olya' }),
      ).getByRole('img', { name: /QR code/ })
      expect(code.querySelector('path')?.getAttribute('d')).toBe(
        encodeQr(`http://hub.local:5002/join#token-1-${'x'.repeat(36)}`).path,
      )
    })

    it('does not call it used on the strength of a list read before it was issued', async () => {
      // The list on screen predates the invitation, so it cannot have it. Reading
      // its absence as "used" would hide the code before anybody had scanned it.
      const hub = fakeHub(HOUSEHOLD)
      renderPanel()
      await rowFor('olya')
      hub.api.fetchAccounts.mockReturnValue(
        new Promise(() => {
          // The reconciling read never arrives.
        }),
      )

      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))

      const card = await screen.findByRole('region', { name: 'Invitation for olya' })
      expect(within(card).getByRole('img', { name: /QR code/ })).toBeInTheDocument()
      expect(card).not.toHaveTextContent(/has been used/)
    })

    it('says to send it to that person and nobody else', async () => {
      fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))

      expect(await screen.findByRole('region', { name: 'Invitation for olya' })).toHaveTextContent(
        /whoever opens it first gets in/,
      )
    })

    it('keeps the token out of the query cache, and lets go of it when closed', async () => {
      fakeHub(HOUSEHOLD)
      const { queryClient } = renderPanel()

      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))
      await screen.findByRole('region', { name: 'Invitation for olya' })

      const everythingCached = () =>
        JSON.stringify([
          queryClient
            .getQueryCache()
            .getAll()
            .map((query) => query.state.data),
          queryClient
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.data),
        ])
      // Collected rather than merely reset: a finished mutation otherwise keeps
      // its answer in the mutation cache for minutes.
      await waitFor(() => {
        expect(everythingCached()).not.toContain('token-1')
      })

      await userEvent.click(screen.getByRole('button', { name: 'Done' }))

      expect(screen.queryByRole('region', { name: 'Invitation for olya' })).toBeNull()
      expect(document.body.innerHTML).not.toContain('token-1')
    })

    it('copies the link', async () => {
      fakeHub(HOUSEHOLD)
      const user = userEvent.setup()

      renderPanel()
      await user.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))
      await user.click(await screen.findByRole('button', { name: 'Copy link' }))

      await expect(navigator.clipboard.readText()).resolves.toBe(
        `http://hub.local:5002/join#token-1-${'x'.repeat(36)}`,
      )
      expect(await screen.findByText('Copied.')).toBeInTheDocument()
    })

    it('withdraws it from the card', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))
      const card = await screen.findByRole('region', { name: 'Invitation for olya' })
      await userEvent.click(within(card).getByRole('button', { name: 'Withdraw' }))

      expect(hub.api.revokeInvitation).toHaveBeenCalledWith('olya')
      await waitFor(() => {
        expect(screen.queryByRole('region', { name: 'Invitation for olya' })).toBeNull()
      })
    })

    it('replaces the card, and the token, when invited again', async () => {
      fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))
      await screen.findByRole('region', { name: 'Invitation for olya' })
      await userEvent.click(
        await within(await rowFor('olya')).findByRole('button', { name: 'New invitation' }),
      )

      await waitFor(() => {
        expect(screen.getByLabelText('Link')).toHaveValue(
          `http://hub.local:5002/join#token-2-${'x'.repeat(36)}`,
        )
      })
      expect(screen.getAllByRole('region', { name: /Invitation for/ })).toHaveLength(1)
    })

    it('says when it has been used, and stops showing the code', async () => {
      const hub = fakeHub(HOUSEHOLD)
      const { queryClient } = renderPanel()

      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))
      const card = await screen.findByRole('region', { name: 'Invitation for olya' })
      hub.redeem('olya')
      // The poll, which this test's client does not run on a timer.
      await readTheListAgain(queryClient)

      expect(await within(card).findByText(/has been used/)).toBeInTheDocument()
      expect(within(card).queryByRole('img', { name: /QR code/ })).toBeNull()
      expect(within(card).queryByLabelText('Link')).toBeNull()
    })

    it('still says it was used once it would have run out as well', async () => {
      const hub = fakeHub(HOUSEHOLD)
      const shortLived = Date.now() + 300
      hub.api.issueInvitation.mockImplementationOnce(() => {
        hub.redeem('olya')
        return Promise.resolve({ token: 'short-lived', expiresAt: new Date(shortLived) })
      })
      const { queryClient } = renderPanel()

      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))
      const card = await screen.findByRole('region', { name: 'Invitation for olya' })
      await readTheListAgain(queryClient)
      expect(await within(card).findByText(/has been used/)).toBeInTheDocument()

      await new Promise((resolve) => setTimeout(resolve, shortLived - Date.now() + 50))
      await readTheListAgain(queryClient)

      expect(card).toHaveTextContent(/has been used/)
    })

    it('says when it has run out, and offers a new one', async () => {
      const hub = fakeHub(HOUSEHOLD)
      hub.api.issueInvitation.mockResolvedValueOnce({
        token: 'already-out-of-time',
        expiresAt: new Date(Date.now() - 1),
      })

      const { queryClient } = renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))
      const card = await screen.findByRole('region', { name: 'Invitation for olya' })
      // The hub leaves an invitation that has run out off the list, as it does one
      // that was used. A read now must not turn one into the other.
      await readTheListAgain(queryClient)

      expect(card).toHaveTextContent(/ran out/)
      expect(card).not.toHaveTextContent(/has been used/)
      expect(within(card).queryByRole('img', { name: /QR code/ })).toBeNull()
      await userEvent.click(within(card).getByRole('button', { name: 'New invitation' }))
      expect(hub.api.issueInvitation).toHaveBeenCalledTimes(2)
    })

    it('says who could not be invited, and why', async () => {
      const hub = fakeHub(HOUSEHOLD)
      hub.api.issueInvitation.mockRejectedValue(
        new HubError('conflict', 'This account is disabled. Enable it first.', 409),
      )

      renderPanel()
      await userEvent.click(within(await rowFor('olya')).getByRole('button', { name: 'Invite' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not invite olya: This account is disabled.',
      )
    })
  })

  describe('adding a person', () => {
    it('makes the account and goes straight to its invitation', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.type(await screen.findByLabelText('Name'), 'bohdana')
      await userEvent.click(screen.getByRole('radio', { name: /operator/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Add and invite' }))

      expect(hub.api.createAccount).toHaveBeenCalledWith('bohdana', 'operator')
      expect(
        await screen.findByRole('region', { name: 'Invitation for bohdana' }),
      ).toBeInTheDocument()
      expect(hub.api.issueInvitation).toHaveBeenCalledWith('bohdana')
      expect(screen.getByLabelText('Name')).toHaveValue('')
    })

    it('makes a viewer unless told otherwise', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      await userEvent.type(await screen.findByLabelText('Name'), 'bohdana')
      await userEvent.click(screen.getByRole('button', { name: 'Add and invite' }))

      expect(hub.api.createAccount).toHaveBeenCalledWith('bohdana', 'viewer')
    })

    it('never offers admin', async () => {
      fakeHub(HOUSEHOLD)

      renderPanel()
      await screen.findByLabelText('Name')

      expect(
        screen.getAllByRole('radio').map((radio) => radio.getAttribute('value')),
      ).toStrictEqual(['viewer', 'operator'])
    })

    it('says what a name may be, and sends nothing until it is one', async () => {
      const hub = fakeHub(HOUSEHOLD)

      renderPanel()
      const field = await screen.findByLabelText('Name')
      await userEvent.type(field, 'Оля')
      await userEvent.click(screen.getByRole('button', { name: 'Add and invite' }))

      expect(hub.api.createAccount).not.toHaveBeenCalled()
      expect(field).toHaveAttribute('aria-invalid', 'true')
      expect(field).toHaveAccessibleDescription(/Latin letters/)
    })

    it('says when the name is taken', async () => {
      const hub = fakeHub(HOUSEHOLD)
      hub.api.createAccount.mockRejectedValue(
        new HubError('conflict', 'There is already an account by that name.', 409),
      )

      renderPanel()
      await userEvent.type(await screen.findByLabelText('Name'), 'Olya')
      await userEvent.click(screen.getByRole('button', { name: 'Add and invite' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('already an account')
      expect(hub.api.issueInvitation).not.toHaveBeenCalled()
      // Kept, so it can be corrected rather than typed again.
      expect(screen.getByLabelText('Name')).toHaveValue('Olya')
    })
  })
})
