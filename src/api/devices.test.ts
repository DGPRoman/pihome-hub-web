import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchDevices, parseDevice, parseDeviceCollection } from './devices'
import { HubError } from './errors'

/** Exactly the shape the hub sends, snake_case and ISO strings included. */
const ANSWERING = {
  id: 'workshop-pc',
  label: 'Workshop PC',
  kind: 'pc-power',
  address: 'http://10.0.0.5',
  firmware: '0.3.0',
  announced_at: '2026-03-01T12:00:00+00:00',
  reachable: true,
  last_polled_at: '2026-03-01T12:30:00+00:00',
  last_seen_at: '2026-03-01T12:30:00+00:00',
  unreachable_since: null,
  last_error: null,
  state: { state: 'on', pending: 'none', observed_at_ms: 412934, uptime_ms: 498210 },
}

/** Declared on the hub and never heard from. The hub lists it anyway, on purpose. */
const NEVER_ANNOUNCED = {
  id: 'study-pc',
  label: 'Study PC',
  kind: 'pc-power',
  address: null,
  firmware: null,
  announced_at: null,
  reachable: null,
  last_polled_at: null,
  last_seen_at: null,
  unreachable_since: null,
  last_error: null,
  state: null,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseDevice', () => {
  it('maps the wire format onto the app’s own shape', () => {
    expect(parseDevice(ANSWERING)).toEqual({
      id: 'workshop-pc',
      label: 'Workshop PC',
      kind: 'pc-power',
      address: 'http://10.0.0.5',
      firmware: '0.3.0',
      announcedAt: new Date('2026-03-01T12:00:00+00:00'),
      reachable: true,
      lastPolledAt: new Date('2026-03-01T12:30:00+00:00'),
      lastSeenAt: new Date('2026-03-01T12:30:00+00:00'),
      unreachableSince: null,
      lastError: null,
      state: { state: 'on', pending: 'none', observed_at_ms: 412934, uptime_ms: 498210 },
    })
  })

  it('keeps “never polled” apart from “polled and unreachable”', () => {
    expect(parseDevice(NEVER_ANNOUNCED).reachable).toBeNull()
    expect(parseDevice({ ...ANSWERING, reachable: false }).reachable).toBe(false)
  })

  it('passes the device’s own status document through untouched', () => {
    // The hub declines to declare what is in here, because it is the device's
    // contract. A parser that knew the fields would need changing every time a
    // device added one, in a different repository.
    const odd = { anything: [1, 2], nested: { deep: true }, count: 0 }
    expect(parseDevice({ ...ANSWERING, state: odd }).state).toEqual(odd)
  })

  it('refuses a status document that is an array', () => {
    // `typeof [] === 'object'` would let this through, and it would then render
    // as a list of numeric keys.
    expect(() => parseDevice({ ...ANSWERING, state: ['on'] })).toThrow(HubError)
  })

  it('refuses a body missing the fields every device has', () => {
    expect(() => parseDevice({ ...ANSWERING, id: undefined })).toThrow(HubError)
    expect(() => parseDevice({ ...ANSWERING, label: 42 })).toThrow(HubError)
    expect(() => parseDevice({ ...ANSWERING, kind: null })).toThrow(HubError)
    expect(() => parseDevice(null)).toThrow(HubError)
    expect(() => parseDevice('workshop-pc')).toThrow(HubError)
  })

  it('refuses a timestamp that is not one', () => {
    // `new Date('yesterday')` does not throw; it produces an Invalid Date that
    // formats as "Invalid Date" on screen and compares as NaN everywhere else.
    expect(() => parseDevice({ ...ANSWERING, last_seen_at: 'yesterday' })).toThrow(HubError)
    expect(() => parseDevice({ ...ANSWERING, announced_at: 17 })).toThrow(HubError)
  })

  it('refuses a reachable that is not a boolean', () => {
    expect(() => parseDevice({ ...ANSWERING, reachable: 'yes' })).toThrow(HubError)
  })

  it('does not let unrecognised fields ride along', () => {
    const parsed = parseDevice({ ...ANSWERING, secret: 'nope' })
    expect(parsed).not.toHaveProperty('secret')
  })
})

describe('parseDeviceCollection', () => {
  it('reads every declared device, including one that never announced', () => {
    const devices = parseDeviceCollection({ devices: [ANSWERING, NEVER_ANNOUNCED] })

    expect(devices).toHaveLength(2)
    expect(devices[1]?.address).toBeNull()
  })

  it('accepts a hub with nothing declared', () => {
    expect(parseDeviceCollection({ devices: [] })).toEqual([])
  })

  it('refuses a body that is not the collection', () => {
    expect(() => parseDeviceCollection({})).toThrow(HubError)
    expect(() => parseDeviceCollection({ devices: null })).toThrow(HubError)
    expect(() => parseDeviceCollection([ANSWERING])).toThrow(HubError)
  })
})

describe('fetchDevices', () => {
  it('reads the collection route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ devices: [ANSWERING] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const devices = await fetchDevices()

    expect(devices).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/devices',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('reports a refusal as a HubError rather than resolving', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'nope' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )

    await expect(fetchDevices()).rejects.toBeInstanceOf(HubError)
  })
})
