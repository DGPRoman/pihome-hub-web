import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as sensorsApi from '../api/sensors'
import type { Sensor } from '../api/types'
import { renderWithQuery } from '../testing/renderWithQuery'
import { SensorPanel } from './SensorPanel'

const PORCH: Sensor = {
  id: 'porch-motion',
  label: 'Porch motion sensor',
  stale: false,
  lastSeen: new Date('2026-08-11T11:59:30Z'),
  motion: true,
  temperature: 18.5,
  humidity: 62,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SensorPanel', () => {
  it('is its own labelled region, distinct from the relay one', async () => {
    vi.spyOn(sensorsApi, 'fetchSensors').mockResolvedValue([])

    renderWithQuery(<SensorPanel />)

    expect(await screen.findByRole('region', { name: 'Sensors' })).toBeInTheDocument()
  })

  it('announces that it is loading while the first read is in flight', () => {
    vi.spyOn(sensorsApi, 'fetchSensors').mockReturnValue(new Promise(() => {}))

    renderWithQuery(<SensorPanel />)

    expect(screen.getByRole('status')).toHaveTextContent('Reading sensor state')
  })

  it('shows the sensors once they arrive', async () => {
    vi.spyOn(sensorsApi, 'fetchSensors').mockResolvedValue([PORCH])

    renderWithQuery(<SensorPanel />)

    expect(await screen.findByText('Porch motion sensor')).toBeInTheDocument()
    expect(screen.getByText('Detected')).toBeInTheDocument()
  })

  it('distinguishes a hub with no sensors from a hub that could not be read', async () => {
    vi.spyOn(sensorsApi, 'fetchSensors').mockResolvedValue([])

    renderWithQuery(<SensorPanel />)

    expect(await screen.findByText(/no sensors are configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure as an alert when nothing has ever arrived', async () => {
    vi.spyOn(sensorsApi, 'fetchSensors').mockRejectedValue(
      new HubError('offline', 'The hub did not answer. Is it running?'),
    )

    renderWithQuery(<SensorPanel />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The hub did not answer')
    })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('keeps showing the last known readings when a refresh fails', async () => {
    const fetch = vi.spyOn(sensorsApi, 'fetchSensors')
    fetch.mockResolvedValueOnce([PORCH])
    fetch.mockRejectedValue(new HubError('offline', 'The hub did not answer. Is it running?'))

    const { queryClient } = renderWithQuery(<SensorPanel />)
    expect(await screen.findByText('Porch motion sensor')).toBeInTheDocument()

    await queryClient.refetchQueries({ queryKey: ['sensors'] })

    expect(await screen.findByRole('alert')).toHaveTextContent('last state the hub reported')
    expect(screen.getByText('Porch motion sensor')).toBeInTheDocument()
  })
})
