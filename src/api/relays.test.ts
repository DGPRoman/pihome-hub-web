import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { HubError } from './errors'
import { fetchRelays, parseRelay, parseRelayCollection, setAllRelays, setRelay } from './relays'

const ONE_RELAY = { id: 'porch-light', label: 'Porch light', on: false }

/**
 * Typed rather than a bare `vi.fn()`, so recorded calls can be inspected without
 * an `any` spreading into the assertions.
 */
type FetchMock = Mock<(input: string, init?: RequestInit) => Promise<Response>>

function stubFetch(response: Response): FetchMock {
  const fetchMock: FetchMock = vi
    .fn<(input: string, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The kind of the `HubError` a promise rejects with. */
async function rejectionKind(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (cause) {
    return cause instanceof HubError ? cause.kind : `not a HubError: ${String(cause)}`
  }
  return 'did not reject'
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseRelay', () => {
  it('accepts a well-formed relay', () => {
    expect(parseRelay(ONE_RELAY)).toEqual(ONE_RELAY)
  })

  it('drops fields it was not promised', () => {
    expect(parseRelay({ ...ONE_RELAY, pin: 17 })).not.toHaveProperty('pin')
  })

  it.each([
    ['a missing field', { id: 'porch-light', label: 'Porch light' }],
    ['on as a string', { ...ONE_RELAY, on: 'false' }],
    ['on as a number', { ...ONE_RELAY, on: 0 }],
    ['null', null],
    ['a string', 'porch-light'],
  ])('rejects %s', (_label, body) => {
    // The hub is strict about the bodies it accepts; a client that shrugged at
    // `on: "false"` would render a live circuit as off.
    expect(() => parseRelay(body)).toThrow(HubError)
  })
})

describe('parseRelayCollection', () => {
  it('accepts a well-formed collection', () => {
    expect(parseRelayCollection({ relays: [ONE_RELAY] })).toEqual([ONE_RELAY])
  })

  it('accepts an empty collection, which is a configured hub with no relays', () => {
    expect(parseRelayCollection({ relays: [] })).toEqual([])
  })

  it.each([
    ['a bare array', [ONE_RELAY]],
    ['null', null],
    ['a string, as a captive portal might return', '<html>Sign in</html>'],
    ['an object without the key', { data: [] }],
    ['relays that are not an array', { relays: ONE_RELAY }],
    ['an entry that is not a relay', { relays: [ONE_RELAY, { id: 'x' }] }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseRelayCollection(body)).toThrow(HubError)
  })
})

describe('fetchRelays', () => {
  it('returns the relays the hub reported', async () => {
    stubFetch(jsonResponse({ relays: [ONE_RELAY] }))

    await expect(fetchRelays()).resolves.toEqual([ONE_RELAY])
  })

  it.each([
    [401, 'unauthorized'],
    [404, 'not-found'],
    [422, 'malformed'],
    [429, 'rate-limited'],
    [500, 'server'],
    // The dev proxy answers 502 for a hub that is not running, so these read as
    // an unreachable hub rather than a hub that failed.
    [502, 'offline'],
    [503, 'offline'],
    [504, 'offline'],
  ])('maps HTTP %i to the %s kind', async (status, kind) => {
    stubFetch(jsonResponse({ detail: 'nope' }, status))

    await expect(rejectionKind(fetchRelays())).resolves.toBe(kind)
  })

  it('reports an unreachable hub as offline rather than as a crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(rejectionKind(fetchRelays())).resolves.toBe('offline')
  })

  it('reports a non-JSON body as malformed', async () => {
    stubFetch(new Response('not json at all', { status: 200 }))

    await expect(rejectionKind(fetchRelays())).resolves.toBe('malformed')
  })

  it('re-throws an abort untouched, so callers can tell it from an outage', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))

    await expect(fetchRelays()).rejects.toBe(abort)
  })

  it('passes the signal to fetch so a request can be cancelled', async () => {
    const fetchMock = stubFetch(jsonResponse({ relays: [] }))
    const { signal } = new AbortController()

    await fetchRelays(signal)

    expect(fetchMock).toHaveBeenCalledWith('/v1/relays', expect.objectContaining({ signal }))
  })
})

describe('setRelay', () => {
  it('returns the state the hub reports after the write', async () => {
    stubFetch(jsonResponse({ ...ONE_RELAY, on: true }))

    await expect(setRelay('porch-light', true)).resolves.toEqual({ ...ONE_RELAY, on: true })
  })

  it.each([true, false])('PUTs the desired state %s rather than toggling', async (on) => {
    // Naming the wanted state is what makes a replay harmless. A toggle endpoint
    // would leave the circuit wherever two racing clicks happened to land.
    const fetchMock = stubFetch(jsonResponse({ ...ONE_RELAY, on }))

    await setRelay('porch-light', on)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/relays/porch-light')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ on }),
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('percent-encodes the relay id into the path', async () => {
    const fetchMock = stubFetch(jsonResponse(ONE_RELAY))

    await setRelay('odd id/1', true)

    expect(fetchMock).toHaveBeenCalledWith('/v1/relays/odd%20id%2F1', expect.anything())
  })

  it('reports an unknown relay as not-found', async () => {
    stubFetch(jsonResponse({ detail: "no relay configured with id 'nope'" }, 404))

    await expect(rejectionKind(setRelay('nope', true))).resolves.toBe('not-found')
  })

  it('reports a body the hub refused as malformed, since that is a bug here', async () => {
    stubFetch(jsonResponse({ detail: 'validation error' }, 422))

    await expect(rejectionKind(setRelay('porch-light', true))).resolves.toBe('malformed')
  })
})

describe('setAllRelays', () => {
  it('returns every relay the hub reports after the write', async () => {
    stubFetch(jsonResponse({ relays: [{ ...ONE_RELAY, on: false }] }))

    await expect(setAllRelays(false)).resolves.toEqual([{ ...ONE_RELAY, on: false }])
  })

  it('PUTs the collection rather than posting to the toggle-all endpoint', async () => {
    // Toggle-all inverts each relay independently, so replaying it against a
    // half-lit house lands somewhere different every time.
    const fetchMock = stubFetch(jsonResponse({ relays: [] }))

    await setAllRelays(false)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/relays')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ on: false }),
    })
  })

  it('reports a rejected key as unauthorized rather than as an empty house', async () => {
    stubFetch(jsonResponse({ detail: 'invalid API key' }, 401))

    await expect(rejectionKind(setAllRelays(false))).resolves.toBe('unauthorized')
  })
})
