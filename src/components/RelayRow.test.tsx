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
})
