import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as devicesApi from '../api/devices'
import { HubError } from '../api/errors'
import type { Device } from '../api/types'
import { renderWithQuery } from '../testing/renderWithQuery'
import { DevicePanel } from './DevicePanel'

/** Every relative time in these tests is measured against the fetch, not the clock. */
const NOW = new Date('2026-03-01T12:30:00Z')

const ANSWERING: Device = {
  id: 'workshop-pc',
  label: 'Workshop PC',
  kind: 'pc-power',
  address: 'http://10.0.0.5',
  firmware: '0.3.0',
  announcedAt: new Date('2026-03-01T12:00:00Z'),
  reachable: true,
  lastPolledAt: NOW,
  lastSeenAt: NOW,
  unreachableSince: null,
  lastError: null,
  state: { state: 'on', pending: 'none', uptime_ms: 498210 },
}

/** The row a device's label is in, once the read has landed. */
async function rowFor(label: string): Promise<HTMLElement> {
  const heading = await screen.findByText(label)
  const row = heading.closest('li')
  expect(row).not.toBeNull()
  return row as HTMLElement
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DevicePanel', () => {
  it('is its own labelled region', async () => {
    vi.spyOn(devicesApi, 'fetchDevices').mockResolvedValue([])
    renderWithQuery(<DevicePanel />)

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Devices' })).toBeInTheDocument()
    })
  })

  it('says so when the hub declares no devices at all', async () => {
    vi.spyOn(devicesApi, 'fetchDevices').mockResolvedValue([])
    renderWithQuery(<DevicePanel />)

    expect(await screen.findByText('No devices are declared on the hub.')).toBeInTheDocument()
  })

  it('reports a failed read rather than an empty list', async () => {
    // An empty list and a hub that would not answer look identical on screen
    // unless one of them says which it is.
    vi.spyOn(devicesApi, 'fetchDevices').mockRejectedValue(
      new HubError('offline', 'The hub did not answer. Is it running?'),
    )
    renderWithQuery(<DevicePanel />)

    expect(await screen.findByText('The hub did not answer. Is it running?')).toBeInTheDocument()
  })

  it('shows a device that is answering, with what it said', async () => {
    vi.spyOn(devicesApi, 'fetchDevices').mockResolvedValue([ANSWERING])
    renderWithQuery(<DevicePanel />)

    const row = await rowFor('Workshop PC')

    expect(within(row).getByText(/http:\/\/10\.0\.0\.5/)).toBeInTheDocument()

    // The device's own field names, not renamed here. What they mean is its
    // contract to state, and a prettier name invented in this repository is one
    // that would have to be kept in step with another.
    expect(within(row).getByText('state')).toBeInTheDocument()
    expect(within(row).getByText('on')).toBeInTheDocument()
    expect(within(row).getByText('498210')).toBeInTheDocument()

    // Nothing is wrong with it, so nothing says anything is.
    expect(within(row).queryByText('Not answering')).not.toBeInTheDocument()
  })

  it('distinguishes a device that never announced from one that went silent', async () => {
    const neverAnnounced: Device = {
      ...ANSWERING,
      id: 'study-pc',
      label: 'Study PC',
      address: null,
      firmware: null,
      announcedAt: null,
      reachable: null,
      lastPolledAt: null,
      lastSeenAt: null,
      state: null,
    }
    const silent: Device = {
      ...ANSWERING,
      id: 'attic-pc',
      label: 'Attic PC',
      reachable: false,
      unreachableSince: new Date('2026-03-01T11:30:00Z'),
      lastError: 'ConnectError: All connection attempts failed',
    }

    vi.spyOn(devicesApi, 'fetchDevices').mockResolvedValue([neverAnnounced, silent])
    renderWithQuery(<DevicePanel />)

    const study = await rowFor('Study PC')
    const attic = await rowFor('Attic PC')

    // The two the whole component exists to keep apart. One has never been
    // switched on; the other was working an hour ago and is not now, and only the
    // second is a fault to go and look at.
    expect(within(study).getByText('Never announced')).toBeInTheDocument()
    expect(within(study).queryByText('Not answering')).not.toBeInTheDocument()

    expect(within(attic).getByText('Not answering')).toBeInTheDocument()
    expect(within(attic).queryByText('Never announced')).not.toBeInTheDocument()
  })

  it('marks a device the hub has announced but not yet polled', async () => {
    // The few seconds after a boot. Rendering it as unreachable would report a
    // fault that has not happened.
    const fresh: Device = {
      ...ANSWERING,
      reachable: null,
      lastPolledAt: null,
      lastSeenAt: null,
      state: null,
    }
    vi.spyOn(devicesApi, 'fetchDevices').mockResolvedValue([fresh])
    renderWithQuery(<DevicePanel />)

    const row = await rowFor('Workshop PC')

    expect(within(row).getByText('Not polled yet')).toBeInTheDocument()
    expect(within(row).queryByText('Not answering')).not.toBeInTheDocument()
  })
})
