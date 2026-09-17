import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Reading, Sensor } from '../api/types'
import { SensorRow } from './SensorRow'

const AS_OF = new Date('2026-08-11T12:00:00Z')
const FIVE_MINUTES_AGO = '2026-08-11T11:55:00Z'

/** A reading the hub sent, with the instant it was taken. */
function reported<T>(value: T, at: string | null = FIVE_MINUTES_AGO): Reading<T> {
  return { kind: 'value', value, at: at === null ? null : new Date(at) }
}

/** The hub sent the field as null: configured, never reported. */
const NEVER = { kind: 'never' } as const

/** The field was not in the response at all: this hub does not report it. */
const UNSUPPORTED = { kind: 'unsupported' } as const

const REPORTING: Sensor = {
  id: 'porch-motion',
  label: 'Porch motion sensor',
  stale: false,
  staleAfterSeconds: 300,
  lastSeen: new Date(FIVE_MINUTES_AGO),
  motion: reported(true),
  temperature: reported(18.5),
  humidity: reported(62),
}

function renderRow(sensor: Sensor) {
  return render(
    <ul>
      <SensorRow sensor={sensor} asOf={AS_OF} />
    </ul>,
  )
}

/** The definition cell holding a quantity, so its own badge and age can be read. */
function quantity(term: string): HTMLElement {
  const cell = screen.getByText(term).nextElementSibling
  if (!(cell instanceof HTMLElement)) {
    throw new Error(`no value cell for "${term}"`)
  }
  return cell
}

describe('SensorRow', () => {
  it('shows every quantity the device reported', () => {
    renderRow(REPORTING)

    expect(screen.getByText('Porch motion sensor')).toBeInTheDocument()
    expect(screen.getByText('Detected')).toBeInTheDocument()
    expect(screen.getByText('18.5 °C')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
  })

  it('says when each reading arrived, in words and machine-readably', () => {
    renderRow(REPORTING)

    const times = screen.getAllByText('5 minutes ago')
    // One per quantity, plus the device's own last-seen line.
    expect(times).toHaveLength(4)
    for (const time of times) {
      expect(time).toHaveAttribute('dateTime', '2026-08-11T11:55:00.000Z')
    }
  })

  it('reports no motion as clear rather than omitting it', () => {
    renderRow({ ...REPORTING, motion: reported(false) })

    expect(screen.getByText('Clear')).toBeInTheDocument()
  })

  it('judges each quantity on its own timestamp, not the device flag', () => {
    // The case the device-wide flag cannot describe: climate arrived a minute ago
    // and bumped last_seen, so the hub reports the device as fresh, while the
    // motion reading behind it is an hour old.
    renderRow({
      ...REPORTING,
      stale: false,
      lastSeen: new Date('2026-08-11T11:59:00Z'),
      motion: reported(true, '2026-08-11T11:00:00Z'),
      temperature: reported(18.5, '2026-08-11T11:59:00Z'),
      humidity: reported(62, '2026-08-11T11:59:00Z'),
    })

    const motion = quantity('Motion')
    expect(within(motion).getByText('Detected')).toBeInTheDocument()
    expect(within(motion).getByText('Stale')).toBeInTheDocument()
    expect(within(motion).getByText('1 hour ago')).toBeInTheDocument()

    // The climate readings are current and must not be tarred with it.
    const temperature = quantity('Temperature')
    expect(within(temperature).getByText('18.5 °C')).toBeInTheDocument()
    expect(within(temperature).queryByText('Stale')).not.toBeInTheDocument()
    expect(within(temperature).getByText('1 minute ago')).toBeInTheDocument()
  })

  it('does not judge a reading when the hub does not report its window', () => {
    // An older hub. Without the window there is no sound verdict — a device being
    // fresh says the window is at least as long as the newest reading is old, and
    // nothing about how much longer — so nothing is claimed either way.
    renderRow({
      ...REPORTING,
      staleAfterSeconds: null,
      motion: reported(true, '2026-08-10T00:00:00Z'),
    })

    const motion = quantity('Motion')
    expect(within(motion).queryByText('Stale')).not.toBeInTheDocument()
    expect(within(motion).getByText('2 days ago')).toBeInTheDocument()
  })

  it('omits a quantity this hub does not report', () => {
    renderRow({ ...REPORTING, temperature: UNSUPPORTED, humidity: UNSUPPORTED })

    expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
    expect(screen.getByText('Motion')).toBeInTheDocument()
  })

  it('distinguishes a quantity never reported from one this hub omits', () => {
    // "This hub version does not send it" and "this sensor has never fired" are
    // different facts, and used to render identically.
    renderRow({ ...REPORTING, temperature: NEVER, humidity: UNSUPPORTED })

    expect(within(quantity('Temperature')).getByText('Never reported')).toBeInTheDocument()
    expect(screen.queryByText('Humidity')).not.toBeInTheDocument()
  })

  it('keeps a reading that carries no timestamp, as one of unknown age', () => {
    // Discarding it loses something true. Showing it as current claims something
    // that is not known.
    renderRow({ ...REPORTING, motion: reported(true, null) })

    const motion = quantity('Motion')
    expect(within(motion).getByText('Detected')).toBeInTheDocument()
    expect(within(motion).getByText('age unknown')).toBeInTheDocument()
    expect(within(motion).queryByText('Stale')).not.toBeInTheDocument()
  })

  it('distinguishes a device that never reported from a quiet one', () => {
    // An unplugged sensor must not read as a cold, still room.
    renderRow({
      ...REPORTING,
      stale: true,
      lastSeen: null,
      motion: NEVER,
      temperature: NEVER,
      humidity: NEVER,
    })

    expect(screen.getByText('No readings yet.')).toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
  })

  it('marks a device whose last reading is too old to trust', () => {
    renderRow({ ...REPORTING, stale: true })

    expect(screen.getAllByText('Stale').length).toBeGreaterThan(0)
    // The readings stay on screen: they are old, not wrong.
    expect(screen.getByText('18.5 °C')).toBeInTheDocument()
  })
})
