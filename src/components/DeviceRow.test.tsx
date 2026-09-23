import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Device } from '../api/types'
import { DeviceRow } from './DeviceRow'

/** Every age below is measured against this, which is a prop rather than the clock. */
const AS_OF = new Date('2026-03-01T12:30:00Z')

const ANSWERING: Device = {
  id: 'workshop-pc',
  label: 'Workshop PC',
  kind: 'pc-power',
  address: 'http://10.0.0.5',
  firmware: '0.3.0',
  announcedAt: new Date('2026-03-01T12:00:00Z'),
  reachable: true,
  lastPolledAt: new Date('2026-03-01T12:29:50Z'),
  lastSeenAt: new Date('2026-03-01T12:29:50Z'),
  unreachableSince: null,
  lastError: null,
  state: { state: 'on', pending: 'none', uptime_ms: 498210 },
}

function renderRow(device: Device) {
  return render(
    <ul>
      <DeviceRow device={device} asOf={AS_OF} />
    </ul>,
  )
}

describe('DeviceRow', () => {
  it('shows where a device is and what it last said', () => {
    renderRow(ANSWERING)

    expect(screen.getByText(/http:\/\/10\.0\.0\.5/)).toBeInTheDocument()
    expect(screen.getByText(/0\.3\.0/)).toBeInTheDocument()

    // The device's own field names, unrenamed. What they mean is its contract to
    // state; a nicer name invented here is one this repository would have to keep
    // in step with another.
    expect(screen.getByText('state')).toBeInTheDocument()
    expect(screen.getByText('on')).toBeInTheDocument()
    expect(screen.getByText('uptime_ms')).toBeInTheDocument()
    expect(screen.getByText('498210')).toBeInTheDocument()
  })

  it('dates a current reading rather than presenting it as timeless', () => {
    renderRow(ANSWERING)
    expect(screen.getByText(/As of 10 seconds ago/)).toBeInTheDocument()
  })

  it('keeps the last reading of a silent device and says when it was true', () => {
    // The hub keeps the reading across a failed poll precisely so a client can do
    // this. Hiding it throws away something true; showing it undated would be a
    // claim about the present that nobody can support.
    renderRow({
      ...ANSWERING,
      reachable: false,
      lastSeenAt: new Date('2026-03-01T12:26:00Z'),
      unreachableSince: new Date('2026-03-01T12:27:00Z'),
      lastError: 'did not answer within 5.0s',
    })

    expect(screen.getByText('on')).toBeInTheDocument()
    expect(screen.getByText(/Last answered/)).toBeInTheDocument()
    expect(screen.getByText(/4 minutes ago/)).toBeInTheDocument()
    expect(screen.getByText(/did not answer within 5\.0s/)).toBeInTheDocument()
  })

  it('reports how long the run of failures has lasted, not when it last failed', () => {
    // unreachable_since is the start of the run, and the hub chose that on
    // purpose: one dropped packet on wifi is ordinary, an hour of them is not,
    // and only the second is worth getting up for. A row showing the latest
    // failure would read "just now" through an outage of any length.
    renderRow({
      ...ANSWERING,
      reachable: false,
      lastPolledAt: AS_OF,
      unreachableSince: new Date('2026-03-01T11:30:00Z'),
      lastError: 'ConnectError: All connection attempts failed',
    })

    expect(screen.getByText(/Silent since 1 hour ago/)).toBeInTheDocument()
  })

  it('still reports a fault when the hub gave no reason for it', () => {
    renderRow({ ...ANSWERING, reachable: false, unreachableSince: null, lastError: null })

    expect(screen.getByText('Not answering')).toBeInTheDocument()
    expect(screen.getByText(/The hub could not reach it/)).toBeInTheDocument()
  })

  it('explains a device that has never announced instead of leaving it blank', () => {
    // The most interesting row in the list. It means nothing has been powered on
    // at that end, or that it cannot reach the hub — neither of which is a
    // polling fault, and both of which are worth saying.
    renderRow({
      ...ANSWERING,
      address: null,
      firmware: null,
      announcedAt: null,
      reachable: null,
      lastPolledAt: null,
      lastSeenAt: null,
      state: null,
    })

    expect(screen.getByText('Never announced')).toBeInTheDocument()
    expect(screen.getByText(/has never said where it is/)).toBeInTheDocument()
    expect(screen.queryByText(/As of/)).not.toBeInTheDocument()
  })

  it('shows a reading whose age the hub did not give, saying the age is unknown', () => {
    // A reading that cannot be dated is still a reading. Hiding it would lose
    // something true; presenting it as current would claim something nobody can
    // support.
    renderRow({ ...ANSWERING, lastSeenAt: null })

    expect(screen.getByText('on')).toBeInTheDocument()
    expect(screen.getByText(/an unknown time ago/)).toBeInTheDocument()
  })

  it('shows a reading of zero or false rather than hiding it', () => {
    // The two values a truthiness test would drop, and the two most worth seeing:
    // a device reporting uptime 0 has just restarted.
    renderRow({ ...ANSWERING, state: { state: 'off', pending: false, uptime_ms: 0 } })

    expect(screen.getByText('off')).toBeInTheDocument()
    expect(screen.getByText('false')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
