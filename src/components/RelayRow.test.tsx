import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as relaysApi from '../api/relays'
import { renderWithQuery } from '../testing/renderWithQuery'
import { RelayRow } from './RelayRow'

const PORCH_OFF = { id: 'porch-light', label: 'Porch light', on: false }
const PORCH_ON = { ...PORCH_OFF, on: true }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RelayRow', () => {
  it('is a switch named after the relay, reporting its state', () => {
    renderWithQuery(<RelayRow relay={PORCH_ON} />)

    // The accessible name is the label alone: the visible On/Off text is hidden
    // from assistive technology because aria-checked already carries the state.
    const control = screen.getByRole('switch', { name: 'Porch light' })
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('asks for the opposite of the state it is showing', async () => {
    const setRelay = vi.spyOn(relaysApi, 'setRelay').mockResolvedValue(PORCH_ON)

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

    // The desired state, not a toggle instruction — see setRelay in the API layer.
    expect(setRelay).toHaveBeenCalledWith('porch-light', true)
  })

  it('refuses further presses while a write is in flight', async () => {
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(
      new Promise(() => {
        // Never settles: models a write still in flight.
      }),
    )

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    const control = screen.getByRole('switch', { name: 'Porch light' })
    await userEvent.click(control)

    await waitFor(() => {
      expect(control).toBeDisabled()
    })
    expect(control).toHaveAttribute('aria-busy', 'true')
  })

  it('announces a refused write instead of failing silently', async () => {
    vi.spyOn(relaysApi, 'setRelay').mockRejectedValue(
      new HubError('unauthorized', 'The hub rejected the API key.', 401),
    )

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The hub rejected the API key.')
  })

  describe('when the hub accepted the write and answered unreadably', () => {
    const unreadable = () =>
      vi
        .spyOn(relaysApi, 'setRelay')
        .mockRejectedValue(
          new HubError('unreadable', 'The hub answered, but this app could not read the reply.'),
        )

    it('does not present it as a failure', async () => {
      unreadable()

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      // status, not alert. The circuit is where they asked for it; only the
      // confirmation was lost, and an alert would send them to fix nothing.
      expect(await screen.findByRole('status')).toHaveTextContent('rechecking with the hub')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('marks the state as unconfirmed rather than showing it as settled', async () => {
      unreadable()

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      await screen.findByRole('status')
      // The row is rendered with a fixed prop here, so the state shown is the one
      // it was given; what matters is that it is marked as not settled.
      expect(screen.getByText(/^(On|Off)\?$/)).toBeInTheDocument()
      expect(screen.queryByText('Off', { exact: true })).toBeNull()
    })

    it('describes the switch with the doubt, since a switch cannot announce mixed', async () => {
      unreadable()

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      const note = await screen.findByRole('status')
      const control = screen.getByRole('switch', { name: 'Porch light' })
      expect(control).toHaveAttribute('aria-describedby', note.id)
    })

    it('stops saying so once the hub has spoken since the write', async () => {
      unreadable()
      const { queryClient, rerender } = renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))
      await screen.findByRole('status')

      // The reconciling read landing, and the panel handing the row down what it
      // said. Derived from the two timestamps the client already keeps, so nothing
      // has to remember to clear it — and nothing can forget to.
      queryClient.setQueryData(['relays'], [PORCH_ON])
      rerender(<RelayRow relay={PORCH_ON} />)

      await waitFor(() => {
        expect(screen.queryByRole('status')).toBeNull()
      })
      expect(screen.getByText('On')).toBeInTheDocument()
    })

    it('still reports an ordinary refusal as a failure', async () => {
      vi.spyOn(relaysApi, 'setRelay').mockRejectedValue(
        new HubError('offline', 'The hub did not answer. Is it running?'),
      )

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('The hub did not answer')
      expect(screen.queryByText('Off?')).toBeNull()
    })
  })
})
