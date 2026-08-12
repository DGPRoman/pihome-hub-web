import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as relaysApi from '../api/relays'
import type { Relay } from '../api/types'
import { renderWithQuery } from '../testing/renderWithQuery'
import { RelayPanel } from './RelayPanel'

const PORCH_OFF = { id: 'porch-light', label: 'Porch light', on: false }
const GATE_OFF = { id: 'gate-light', label: 'Gate light', on: false }
const PORCH_ON = { ...PORCH_OFF, on: true }
const GATE_ON = { ...GATE_OFF, on: true }

/** A promise the test settles by hand, to hold a request in flight. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RelayPanel', () => {
  it('is labelled by its heading', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    renderWithQuery(<RelayPanel />)

    expect(screen.getByRole('region', { name: 'Relays' })).toBeInTheDocument()
  })

  it('announces that it is loading while the first read is in flight', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockReturnValue(deferred<readonly Relay[]>().promise)

    renderWithQuery(<RelayPanel />)

    expect(screen.getByRole('status')).toHaveTextContent('Reading relay state')
  })

  it('shows the relays once they arrive', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF, GATE_OFF])

    renderWithQuery(<RelayPanel />)

    expect(await screen.findByRole('switch', { name: 'Porch light' })).toBeInTheDocument()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('distinguishes a hub with no relays from a hub that could not be read', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    renderWithQuery(<RelayPanel />)

    expect(await screen.findByText(/no relays are configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure as an alert when nothing has ever arrived', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockRejectedValue(
      new HubError('offline', 'The hub did not answer. Is it running?'),
    )

    renderWithQuery(<RelayPanel />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The hub did not answer')
    })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('flips the switch before the hub has confirmed it', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])
    const write = deferred<Relay>()
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(write.promise)

    renderWithQuery(<RelayPanel />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    // The write has not resolved. What is on screen is the optimistic value,
    // written straight into the cache, which is the whole point of doing it.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Porch light' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    write.resolve({ ...PORCH_OFF, on: true })
  })

  it('does not leave the switch flipped when the hub refuses the write', async () => {
    // Both requests are driven by hand. The reconciling read is never answered, so
    // the state this ends on can only have come from the snapshot — letting it
    // answer would restore the switch by itself and the test would pass with the
    // rollback deleted.
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_OFF])
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const write = deferred<Relay>()
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(write.promise)

    renderWithQuery(<RelayPanel />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    const porch = () => screen.getByRole('switch', { name: 'Porch light' })
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'true')
    })

    write.reject(new HubError('rate-limited', 'The hub is refusing further attempts for now.', 429))

    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('leaves other relays usable while one write is in flight', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF, GATE_OFF])
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(deferred<Relay>().promise)

    renderWithQuery(<RelayPanel />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    // Each row owns its own mutation, so a shared pending flag cannot grey out
    // the whole list.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Porch light' })).toBeDisabled()
    })
    expect(screen.getByRole('switch', { name: 'Gate light' })).toBeEnabled()
  })

  it('offers no bulk control until the hub has said what there is to switch off', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockReturnValue(deferred<readonly Relay[]>().promise)

    renderWithQuery(<RelayPanel />)

    expect(screen.queryByRole('button', { name: 'All off' })).not.toBeInTheDocument()
  })

  it('opens every relay before the hub has confirmed it', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_ON, GATE_ON])
    const write = deferred<readonly Relay[]>()
    vi.spyOn(relaysApi, 'setAllRelays').mockReturnValue(write.promise)

    renderWithQuery(<RelayPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'All off' }))

    await waitFor(() => {
      for (const control of screen.getAllByRole('switch')) {
        expect(control).toHaveAttribute('aria-checked', 'false')
      }
    })

    write.resolve([PORCH_OFF, GATE_OFF])
  })

  it('leaves every relay as it was when the hub refuses the bulk write', async () => {
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_ON, GATE_OFF])
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const write = deferred<readonly Relay[]>()
    vi.spyOn(relaysApi, 'setAllRelays').mockReturnValue(write.promise)

    renderWithQuery(<RelayPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'All off' }))

    const porch = () => screen.getByRole('switch', { name: 'Porch light' })
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'false')
    })

    write.reject(new HubError('rate-limited', 'The hub is refusing further attempts for now.', 429))

    // The snapshot goes back whole, so the porch light returns to on. A rollback
    // that inverted instead would be wrong for the gate light, which was already
    // off before the button was pressed.
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'true')
    })
    expect(screen.getByRole('switch', { name: 'Gate light' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('keeps showing the last known state when a refresh fails', async () => {
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_OFF])
    fetch.mockRejectedValue(new HubError('offline', 'The hub did not answer. Is it running?'))

    const { queryClient } = renderWithQuery(<RelayPanel />)
    expect(await screen.findByRole('switch', { name: 'Porch light' })).toBeInTheDocument()

    await queryClient.refetchQueries({ queryKey: ['relays'] })

    // A failed poll must not blank a working list. The warning says the data is
    // stale; throwing it away would discard something true.
    expect(await screen.findByRole('alert')).toHaveTextContent('last state the hub reported')
    expect(screen.getByRole('switch', { name: 'Porch light' })).toBeInTheDocument()
  })
})
