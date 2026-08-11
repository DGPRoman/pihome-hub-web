import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Sensor } from '../api/types'
import { SensorRow } from './SensorRow'

const AS_OF = new Date('2026-08-11T12:00:00Z')

const REPORTING: Sensor = {
  id: 'porch-motion',
  label: 'Porch motion sensor',
  stale: false,
  lastSeen: new Date('2026-08-11T11:55:00Z'),
  motion: true,
  temperature: 18.5,
  humidity: 62,
}

function renderRow(sensor: Sensor) {
  return render(
    <ul>
      <SensorRow sensor={sensor} asOf={AS_OF} />
    </ul>,
  )
}

describe('SensorRow', () => {
  it('shows every quantity the device reported', () => {
    renderRow(REPORTING)

    expect(screen.getByText('Porch motion sensor')).toBeInTheDocument()
    expect(screen.getByText('Detected')).toBeInTheDocument()
    expect(screen.getByText('18.5 °C')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
  })

  it('says when the reading arrived, in words and machine-readably', () => {
    renderRow(REPORTING)

    const time = screen.getByText('5 minutes ago')
    expect(time).toHaveAttribute('dateTime', '2026-08-11T11:55:00.000Z')
  })

  it('reports no motion as clear rather than omitting it', () => {
    renderRow({ ...REPORTING, motion: false })

    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('omits a quantity the device does not report at all', () => {
    renderRow({ ...REPORTING, temperature: null, humidity: null })

    expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
    expect(screen.getByText('Motion')).toBeInTheDocument()
  })

  it('distinguishes a device that never reported from a quiet one', () => {
    // An unplugged sensor must not read as a cold, still room.
    renderRow({
      ...REPORTING,
      stale: true,
      lastSeen: null,
      motion: null,
      temperature: null,
      humidity: null,
    })

    expect(screen.getByText('No readings yet.')).toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })

  it('marks a device whose last reading is too old to trust', () => {
    renderRow({ ...REPORTING, stale: true })

    expect(screen.getByText('Stale')).toBeInTheDocument()
    // The readings stay on screen: they are old, not wrong.
    expect(screen.getByText('18.5 °C')).toBeInTheDocument()
  })
})
