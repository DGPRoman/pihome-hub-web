import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from './errors'
import { fetchRelays, parseRelayCollection } from './relays'

const ONE_RELAY = { id: 'porch-light', label: 'Porch light', on: false }

function stubFetch(response: Response | Promise<never>): void {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(Promise.resolve(response)))
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

describe('parseRelayCollection', () => {
  it('accepts a well-formed collection', () => {
    expect(parseRelayCollection({ relays: [ONE_RELAY] })).toEqual([ONE_RELAY])
  })

  it('accepts an empty collection, which is a configured hub with no relays', () => {
    expect(parseRelayCollection({ relays: [] })).toEqual([])
  })

  it('drops fields it was not promised, so a future hub cannot smuggle state in', () => {
    const parsed = parseRelayCollection({ relays: [{ ...ONE_RELAY, pin: 17 }] })

    expect(parsed).toEqual([ONE_RELAY])
    expect(parsed[0]).not.toHaveProperty('pin')
  })

  it.each([
    ['a bare array', [ONE_RELAY]],
    ['null', null],
    ['a string, as a captive portal might return', '<html>Sign in</html>'],
    ['an object without the key', { data: [] }],
    ['relays that are not an array', { relays: ONE_RELAY }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseRelayCollection(body)).toThrow(HubError)
  })

  it.each([
    ['a missing field', { id: 'porch-light', label: 'Porch light' }],
    ['on as a string', { ...ONE_RELAY, on: 'false' }],
    ['on as a number', { ...ONE_RELAY, on: 0 }],
    ['a null entry', null],
  ])('rejects an entry with %s', (_label, relay) => {
    // The hub is strict about the bodies it accepts; a client that shrugged at
    // `on: "false"` would render a live circuit as off.
    expect(() => parseRelayCollection({ relays: [relay] })).toThrow(HubError)
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
    [429, 'rate-limited'],
    [500, 'server'],
    // The dev proxy answers 502 for a hub that is not running, so these read as
    // an unreachable hub rather than a hub that failed.
    [502, 'offline'],
    [503, 'offline'],
    [504, 'offline'],
  ])('maps HTTP %i to the %s kind', async (status, kind) => {
    stubFetch(jsonResponse({ detail: 'Invalid or missing API key' }, status))

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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ relays: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { signal } = new AbortController()

    await fetchRelays(signal)

    expect(fetchMock).toHaveBeenCalledWith('/v1/relays', expect.objectContaining({ signal }))
  })
})
