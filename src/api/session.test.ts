import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { HubError } from './errors'
import { fetchSession, logIn, logOut, parseSession } from './session'

const BODY = { username: 'roman', role: 'operator', expires_at: '2026-10-21T08:00:00Z' }

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

describe('parseSession', () => {
  it('converts the wire shape into the one this client uses', () => {
    const session = parseSession(BODY)

    expect(session.username).toBe('roman')
    expect(session.role).toBe('operator')
    // A Date, not the string the wire carries: converted once, here, so nothing
    // downstream deals with something it has to remember is a date.
    expect(session.expiresAt.toISOString()).toBe('2026-10-21T08:00:00.000Z')
  })

  it('builds its own object, so unpromised fields cannot ride along', () => {
    const session = parseSession({ ...BODY, token: 'not-something-the-hub-sends' })

    expect(Object.keys(session).sort()).toStrictEqual(['expiresAt', 'role', 'username'])
  })

  it.each([
    ['no username', { ...BODY, username: undefined }],
    ['a numeric username', { ...BODY, username: 7 }],
    ['no role', { ...BODY, role: undefined }],
    ['no expiry', { ...BODY, expires_at: undefined }],
    ['an unparseable expiry', { ...BODY, expires_at: 'the day after tomorrow' }],
    ['not an object at all', 'roman'],
  ])('refuses %s', (_name, body) => {
    expect(() => parseSession(body)).toThrow(HubError)
  })

  it('refuses a role it does not know', () => {
    // Not a role this client can decide anything from, and guessing would mean
    // guessing in the permissive direction.
    expect(() => parseSession({ ...BODY, role: 'superuser' })).toThrow(HubError)
  })
})

describe('fetchSession', () => {
  it('returns who the hub says you are', async () => {
    stubFetch(jsonResponse(BODY))

    const session = await fetchSession()

    expect(session?.username).toBe('roman')
  })

  it('answers null for a 401 rather than rejecting', async () => {
    // Being logged out is the ordinary state of a page somebody has just opened,
    // not a failure of it. A rejection here would put the whole shell into an
    // error state on the one path that is supposed to end at a login form.
    stubFetch(jsonResponse({ detail: 'Not authenticated' }, 401))

    await expect(fetchSession()).resolves.toBeNull()
  })

  it('still rejects when the hub is not answering', async () => {
    // A hub that is down is not the same as a hub saying nobody is here, and
    // showing a login form to somebody whose network is off would be a lie.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(rejectionKind(fetchSession())).resolves.toBe('offline')
  })

  it('still rejects an answer it cannot read', async () => {
    stubFetch(jsonResponse({ username: 'roman' }))

    await expect(rejectionKind(fetchSession())).resolves.toBe('unreadable')
  })

  it('sends no CSRF header, because it changes nothing', async () => {
    const fetchMock = stubFetch(jsonResponse(BODY))

    await fetchSession()

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers['X-Pihome-CSRF']).toBeUndefined()
  })
})

describe('logIn', () => {
  it('posts the credentials and returns the session', async () => {
    const fetchMock = stubFetch(jsonResponse(BODY))

    const session = await logIn('roman', 'correct-horse-battery')

    expect(fetchMock).toHaveBeenCalledWith('/v1/session', expect.anything())
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(
      JSON.stringify({ username: 'roman', password: 'correct-horse-battery' }),
    )
    expect(session.role).toBe('operator')
  })

  it('carries the CSRF header, because it is a write', async () => {
    const fetchMock = stubFetch(jsonResponse(BODY))

    await logIn('roman', 'correct-horse-battery')

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>
    expect(headers['X-Pihome-CSRF']).toBeDefined()
  })

  it('reports a refusal rather than swallowing it', async () => {
    stubFetch(jsonResponse({ detail: 'Wrong username or password' }, 401))

    await expect(rejectionKind(logIn('roman', 'wrong'))).resolves.toBe('unauthorized')
  })

  it('reports being rate limited distinguishably', async () => {
    // The hub counts login failures in their own bucket. Somebody who has hit it
    // needs to be told to wait, not told their password is wrong again.
    stubFetch(jsonResponse({ detail: 'Too many failed attempts' }, 429))

    await expect(rejectionKind(logIn('roman', 'wrong'))).resolves.toBe('rate-limited')
  })
})

describe('logOut', () => {
  it('deletes the session', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))

    await logOut()

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('treats an already-expired session as logged out', async () => {
    // Somebody asked to be logged out and they are. Reporting a failure would be
    // telling them the opposite of what happened.
    stubFetch(jsonResponse({ detail: 'Not authenticated' }, 401))

    await expect(logOut()).resolves.toBeUndefined()
  })

  it('still reports a hub that is not answering', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(rejectionKind(logOut())).resolves.toBe('offline')
  })
})
