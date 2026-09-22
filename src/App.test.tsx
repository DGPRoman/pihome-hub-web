import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as automationApi from './api/automation'
import { HubError } from './api/errors'
import * as relaysApi from './api/relays'
import * as sensorsApi from './api/sensors'
import * as sessionApi from './api/session'
import type { Session } from './api/types'
import { App } from './App'
import { renderWithQuery } from './testing/renderWithQuery'

const OPERATOR: Session = {
  username: 'roman',
  role: 'operator',
  expiresAt: new Date('2026-10-21T08:00:00Z'),
}

/** The panels all read on mount; what each state looks like is their own concern. */
function stubTheHouse(): void {
  vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])
  vi.spyOn(sensorsApi, 'fetchSensors').mockResolvedValue([])
  vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([])
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the title and one labelled region per section once logged in', async () => {
    stubTheHouse()
    vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(OPERATOR)

    renderWithQuery(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'pihome-hub' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Relays' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sensors' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Automation' })).toBeInTheDocument()
  })

  it('shows who is logged in, and their role', async () => {
    stubTheHouse()
    vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(OPERATOR)

    renderWithQuery(<App />)

    expect(await screen.findByText('roman')).toBeInTheDocument()
    // The role decides what the rest of the page will let you do, so somebody
    // refused a switch can see why without reading a 403 they never asked for.
    expect(screen.getByText('operator')).toBeInTheDocument()
  })

  describe('before the hub has answered', () => {
    it('shows neither the house nor a way in', () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockReturnValue(
        new Promise(() => {
          // Never settles: the first probe still in flight.
        }),
      )

      renderWithQuery(<App />)

      // Three states, not two. A login form here would flash at somebody who is
      // already logged in, on every page load.
      expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'Relays' })).toBeNull()
      expect(screen.getByRole('status')).toHaveTextContent('who you are')
    })
  })

  describe('when nobody is logged in', () => {
    it('offers a login form instead of an empty dashboard', async () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(null)

      renderWithQuery(<App />)

      expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Relays' })).toBeNull()
    })

    it('does not ask the hub about the house at all', async () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(null)

      renderWithQuery(<App />)
      await screen.findByRole('button', { name: 'Log in' })

      // Not merely hidden. A panel that mounts and 401s would put a failure on
      // screen for the ordinary state of a page somebody has just opened.
      expect(relaysApi.fetchRelays).not.toHaveBeenCalled()
    })

    it('shows the house once they log in', async () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(sessionApi, 'logIn').mockResolvedValue(OPERATOR)

      renderWithQuery(<App />)
      await userEvent.type(await screen.findByLabelText('Username'), 'roman')
      await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery')
      await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

      expect(await screen.findByRole('region', { name: 'Relays' })).toBeInTheDocument()
    })

    it('says what the hub said when the credentials are refused', async () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(null)
      vi.spyOn(sessionApi, 'logIn').mockRejectedValue(
        new HubError('unauthorized', 'Wrong username or password.', 401),
      )

      renderWithQuery(<App />)
      await userEvent.type(await screen.findByLabelText('Username'), 'roman')
      await userEvent.type(screen.getByLabelText('Password'), 'wrong')
      await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.')
    })
  })

  describe('when the hub cannot be reached', () => {
    it('says so rather than offering a login form', async () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockRejectedValue(
        new HubError('offline', 'The hub did not answer. Is it running?'),
      )

      renderWithQuery(<App />)

      // The hub did not say nobody is here — it did not answer at all, and a way
      // in would be a lie somebody would spend their time on.
      expect(await screen.findByRole('alert')).toHaveTextContent('The hub did not answer')
      expect(screen.queryByRole('button', { name: 'Log in' })).toBeNull()
    })
  })

  describe('when the session expires while the page is open', () => {
    it('a 401 from a panel returns the page to the login form', async () => {
      vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(OPERATOR)
      vi.spyOn(sensorsApi, 'fetchSensors').mockResolvedValue([])
      vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([])
      vi.spyOn(relaysApi, 'fetchRelays').mockRejectedValue(
        new HubError('unauthorized', 'Not authenticated', 401),
      )

      renderWithQuery(<App />)

      // Handled once on the cache rather than in each hook: every read and every
      // write can meet this, and a per-hook answer is three lines repeated until
      // one is forgotten.
      expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument()
    })
  })

  describe('logging in after a session expired', () => {
    it('does not show the house the previous session saw', async () => {
      // The path where stale data survives. Logging *out* clears every query, so
      // nothing is left to be stale; an expiry only records that nobody is logged
      // in, and TanStack keeps an unmounted query's data for minutes afterwards.
      // Log in again inside that window and the panels remount onto whatever the
      // last session saw — someone else's house, or your own from before a change
      // you made in another tab.
      vi.spyOn(sensorsApi, 'fetchSensors').mockResolvedValue([])
      vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([])
      const relays = vi.spyOn(relaysApi, 'fetchRelays')
      relays.mockResolvedValue([{ id: 'porch-light', label: 'Porch light', on: true }])

      const session = vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(OPERATOR)
      const { queryClient } = renderWithQuery(<App />)
      await screen.findByRole('switch', { name: 'Porch light' })

      // The session expires: what a 401 from anything records.
      session.mockResolvedValue(null)
      queryClient.setQueryData(['session'], null)
      await screen.findByRole('button', { name: 'Log in' })

      relays.mockResolvedValue([{ id: 'gate-light', label: 'Gate light', on: false }])
      vi.spyOn(sessionApi, 'logIn').mockResolvedValue(OPERATOR)
      await userEvent.type(screen.getByLabelText('Username'), 'anna')
      await userEvent.type(screen.getByLabelText('Password'), 'battery-staple-horse')
      await userEvent.click(screen.getByRole('button', { name: 'Log in' }))

      expect(await screen.findByRole('switch', { name: 'Gate light' })).toBeInTheDocument()
      expect(screen.queryByRole('switch', { name: 'Porch light' })).toBeNull()
    })
  })

  describe('logging out', () => {
    it('puts the login form back', async () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(OPERATOR)
      vi.spyOn(sessionApi, 'logOut').mockResolvedValue()

      renderWithQuery(<App />)
      await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

      expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Relays' })).toBeNull()
    })

    it('puts it back even when the hub refuses the request', async () => {
      stubTheHouse()
      vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(OPERATOR)
      vi.spyOn(sessionApi, 'logOut').mockRejectedValue(
        new HubError('offline', 'The hub did not answer. Is it running?'),
      )

      renderWithQuery(<App />)
      await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

      // They asked to be logged out. Leaving the house on screen after that is
      // the one outcome nobody wants — a shared laptop is why the button exists.
      await waitFor(() => {
        expect(screen.queryByRole('region', { name: 'Relays' })).toBeNull()
      })
    })
  })
})
