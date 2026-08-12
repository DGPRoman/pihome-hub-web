import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as relaysApi from '../api/relays'
import { renderWithQuery } from '../testing/renderWithQuery'
import { AllOffButton } from './AllOffButton'

const PORCH_ON = { id: 'porch-light', label: 'Porch light', on: true }
const GATE_OFF = { id: 'gate-light', label: 'Gate light', on: false }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AllOffButton', () => {
  it('asks for off, never for a toggle', async () => {
    const setAll = vi.spyOn(relaysApi, 'setAllRelays').mockResolvedValue([])

    renderWithQuery(<AllOffButton relays={[PORCH_ON, GATE_OFF]} />)
    await userEvent.click(screen.getByRole('button', { name: 'All off' }))

    expect(setAll).toHaveBeenCalledWith(false)
  })

  it('does nothing to offer when every relay is already off', () => {
    renderWithQuery(<AllOffButton relays={[GATE_OFF]} />)

    expect(screen.getByRole('button', { name: 'All off' })).toBeDisabled()
  })

  it('refuses further presses while a write is in flight', async () => {
    vi.spyOn(relaysApi, 'setAllRelays').mockReturnValue(
      new Promise(() => {
        // Never settles: models a write still in flight.
      }),
    )

    renderWithQuery(<AllOffButton relays={[PORCH_ON]} />)
    const control = screen.getByRole('button', { name: 'All off' })
    await userEvent.click(control)

    await waitFor(() => {
      expect(control).toBeDisabled()
    })
    expect(control).toHaveAttribute('aria-busy', 'true')
  })

  it('announces a refused write instead of failing silently', async () => {
    vi.spyOn(relaysApi, 'setAllRelays').mockRejectedValue(
      new HubError('unauthorized', 'The hub rejected the API key.', 401),
    )

    renderWithQuery(<AllOffButton relays={[PORCH_ON]} />)
    await userEvent.click(screen.getByRole('button', { name: 'All off' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The hub rejected the API key.')
  })
})
