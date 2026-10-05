import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchAndroidApp } from './androidApp'
import { HubError } from './errors'

const SHA256 = 'a'.repeat(64)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchAndroidApp', () => {
  it('asks the hub, with no session needed, and reads what it offers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sha256: SHA256, size: 12_345 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAndroidApp()).resolves.toEqual({ sha256: SHA256, size: 12_345 })
    expect(fetchMock).toHaveBeenCalledWith(
      '/app/android.json',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('is nothing, not a failure, while the hub offers no app', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ detail: 'This hub has no Android app to offer' }, 404)),
    )

    await expect(fetchAndroidApp()).resolves.toBeNull()
  })

  it.each([
    { sha256: 'not hex', size: 1 },
    { sha256: SHA256.toUpperCase(), size: 1 },
    { sha256: SHA256, size: 0 },
    { sha256: SHA256, size: 1.5 },
    { sha256: SHA256 },
    [],
  ])('refuses a description it cannot trust: %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(fetchAndroidApp()).rejects.toMatchObject({ kind: 'unreadable' })
  })

  it('still fails when the hub cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchAndroidApp()).rejects.toBeInstanceOf(HubError)
  })
})
