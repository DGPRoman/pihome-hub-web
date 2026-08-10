import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as relaysApi from '../api/relays'
import { RelayPanel } from './RelayPanel'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RelayPanel', () => {
  it('is labelled by its heading', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    render(<RelayPanel />)

    expect(screen.getByRole('region', { name: 'Relays' })).toBeInTheDocument()
  })

  it('announces that it is loading while the request is in flight', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockReturnValue(new Promise(() => {}))

    render(<RelayPanel />)

    expect(screen.getByRole('status')).toHaveTextContent('Reading relay state')
  })

  it('shows the relays once they arrive', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([
      { id: 'porch-light', label: 'Porch light', on: true },
    ])

    render(<RelayPanel />)

    expect(await screen.findByText('Porch light')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('distinguishes a hub with no relays from a hub that could not be read', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    render(<RelayPanel />)

    expect(await screen.findByText(/no relays are configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure as an alert, in the words the client chose', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockRejectedValue(
      new HubError('offline', 'The hub did not answer. Is it running?'),
    )

    render(<RelayPanel />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The hub did not answer')
    })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
