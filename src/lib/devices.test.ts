import { describe, expect, it } from 'vitest'

import type { Device } from '../api/types'
import { formatStateValue, hasReading, standingOf } from './devices'

const BASE: Device = {
  id: 'workshop-pc',
  label: 'Workshop PC',
  kind: 'pc-power',
  address: 'http://10.0.0.5',
  firmware: '0.3.0',
  announcedAt: new Date('2026-03-01T12:00:00Z'),
  reachable: true,
  lastPolledAt: new Date('2026-03-01T12:30:00Z'),
  lastSeenAt: new Date('2026-03-01T12:30:00Z'),
  unreachableSince: null,
  lastError: null,
  state: { state: 'on' },
}

describe('standingOf', () => {
  it('reads a device that answered its last poll as answering', () => {
    expect(standingOf(BASE)).toBe('answering')
  })

  it('reads a device that has never announced as never announced', () => {
    // It is declared on the hub and has said nothing. The hub lists it on purpose,
    // because it is the most interesting row rather than one to leave out.
    expect(standingOf({ ...BASE, address: null, reachable: null })).toBe('never-announced')
  })

  it('reads an announced device the hub has not asked yet as not polled', () => {
    // The few seconds after a boot. Not a fault, and not the same as silent.
    expect(standingOf({ ...BASE, reachable: null })).toBe('never-polled')
  })

  it('reads a device that failed its last poll as silent', () => {
    expect(standingOf({ ...BASE, reachable: false })).toBe('silent')
  })

  it('does not call a device that never announced “silent” because it is unreachable', () => {
    // The distinction this whole type exists for. A hub that has never had an
    // address cannot have failed to reach one, and reporting it as a fault sends
    // somebody looking for a broken device that was never switched on.
    const never = { ...BASE, address: null, reachable: null, state: null, lastSeenAt: null }
    expect(standingOf(never)).not.toBe('silent')
  })
})

describe('hasReading', () => {
  it('is true for a reading the hub kept across a failed poll', () => {
    // The case it exists for: the device is unreachable and the hub still holds
    // what it last said. Showing that with its age is the point.
    const kept = { ...BASE, reachable: false, unreachableSince: new Date('2026-03-01T12:31:00Z') }
    expect(hasReading(kept)).toBe(true)
  })

  it('is true for a reading whose age is missing', () => {
    // A reading that cannot be dated is still a reading. Dropping it here would
    // lose something true; the row says the age is unknown instead.
    expect(hasReading({ ...BASE, lastSeenAt: null })).toBe(true)
  })

  it('is false when there is no reading', () => {
    expect(hasReading({ ...BASE, state: null })).toBe(false)
  })
})

describe('formatStateValue', () => {
  it('shows a string as itself rather than quoted', () => {
    expect(formatStateValue('on')).toBe('on')
  })

  it('shows numbers and booleans, including the ones that are falsy', () => {
    // Zero and false are readings, not absences. A renderer that tested the value
    // for truthiness would hide the two that matter most.
    expect(formatStateValue(0)).toBe('0')
    expect(formatStateValue(false)).toBe('false')
    expect(formatStateValue(498210)).toBe('498210')
  })

  it('shows null as null', () => {
    expect(formatStateValue(null)).toBe('null')
  })

  it('shows a nested value as what it is, not as [object Object]', () => {
    expect(formatStateValue({ deep: true })).toBe('{"deep":true}')
    expect(formatStateValue([1, 2])).toBe('[1,2]')
  })
})
