import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

import { HubError } from './errors'
import {
  changeAccount,
  createAccount,
  deleteAccount,
  fetchAccounts,
  issueInvitation,
  parseAccount,
  parseInvitation,
  revokeInvitation,
} from './users'

const OLYA = {
  username: 'olya',
  role: 'operator',
  disabled: false,
  created_at: '2026-10-05T09:00:00Z',
  invitation_expires_at: '2026-10-05T09:15:00.123456Z',
}

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

function sent(fetchMock: FetchMock): { path: string; init: RequestInit } {
  const call = fetchMock.mock.calls[0]
  if (call === undefined) {
    throw new Error('nothing was sent')
  }
  return { path: call[0], init: call[1] ?? {} }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseAccount', () => {
  it('converts the wire shape into the one this client uses', () => {
    const account = parseAccount(OLYA)

    expect(account.username).toBe('olya')
    expect(account.createdAt.toISOString()).toBe('2026-10-05T09:00:00.000Z')
    // Six digits of fraction from the hub, which writes microseconds.
    expect(account.invitationExpiresAt?.toISOString()).toBe('2026-10-05T09:15:00.123Z')
  })

  it('reads no invitation as null rather than as a date', () => {
    expect(parseAccount({ ...OLYA, invitation_expires_at: null }).invitationExpiresAt).toBeNull()
  })

  it('builds its own object, so unpromised fields cannot ride along', () => {
    const account = parseAccount({ ...OLYA, password_hash: 'scrypt$…' })

    expect(Object.keys(account).sort()).toStrictEqual([
      'createdAt',
      'disabled',
      'invitationExpiresAt',
      'role',
      'username',
    ])
  })

  it.each([
    ['no username', { ...OLYA, username: undefined }],
    ['a role it does not know', { ...OLYA, role: 'owner' }],
    ['disabled as a string', { ...OLYA, disabled: 'false' }],
    ['no creation date', { ...OLYA, created_at: undefined }],
    ['an unparseable invitation expiry', { ...OLYA, invitation_expires_at: 'soon' }],
    ['a missing invitation field', { ...OLYA, invitation_expires_at: undefined }],
  ])('refuses %s', (_name, body) => {
    expect(() => parseAccount(body)).toThrow(HubError)
  })
})

describe('parseInvitation', () => {
  it('keeps the token and when it stops working', () => {
    const invitation = parseInvitation({ token: 'abc', expires_at: '2026-10-05T09:15:00Z' })

    expect(invitation).toStrictEqual({
      token: 'abc',
      expiresAt: new Date('2026-10-05T09:15:00Z'),
    })
  })

  it.each([
    ['an empty token', { token: '', expires_at: '2026-10-05T09:15:00Z' }],
    ['no token', { expires_at: '2026-10-05T09:15:00Z' }],
    ['no expiry', { token: 'abc' }],
  ])('refuses %s', (_name, body) => {
    // An empty token would make a link that opens nothing, shown as if it worked.
    expect(() => parseInvitation(body)).toThrow(HubError)
  })
})

describe('fetchAccounts', () => {
  it('reads the list', async () => {
    const fetchMock = stubFetch(jsonResponse({ users: [OLYA] }))

    const accounts = await fetchAccounts()

    expect(sent(fetchMock).path).toBe('/v1/users')
    expect(accounts.map((account) => account.username)).toStrictEqual(['olya'])
  })

  it('refuses a body that is not a list of accounts', async () => {
    stubFetch(jsonResponse([OLYA]))

    await expect(fetchAccounts()).rejects.toMatchObject({ kind: 'unreadable' })
  })
})

describe('createAccount', () => {
  it('sends a name and a role, and no password', async () => {
    const fetchMock = stubFetch(jsonResponse({ ...OLYA, invitation_expires_at: null }, 201))

    await createAccount('olya', 'operator')

    const { path, init } = sent(fetchMock)
    expect(path).toBe('/v1/users')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ username: 'olya', role: 'operator' }))
    expect((init.headers as Record<string, string>)['X-Pihome-CSRF']).toBeDefined()
  })

  it('says a taken name is taken, and that case does not count', async () => {
    stubFetch(jsonResponse({ detail: 'username already exists' }, 409))

    await expect(createAccount('Olya', 'viewer')).rejects.toMatchObject({
      kind: 'conflict',
      message: expect.stringMatching(/already an account by that name.*ignoring case/) as unknown,
    })
  })

  it('says it was the name the hub refused', async () => {
    stubFetch(jsonResponse({ detail: 'username must be letters and digits' }, 422))

    await expect(createAccount('o', 'viewer')).rejects.toMatchObject({
      kind: 'malformed',
      message: 'The hub did not accept that name.',
    })
  })
})

describe('changeAccount', () => {
  it('patches only what is changing', async () => {
    const fetchMock = stubFetch(jsonResponse({ ...OLYA, role: 'viewer' }))

    const account = await changeAccount('olya', { role: 'viewer' })

    const { path, init } = sent(fetchMock)
    expect(path).toBe('/v1/users/olya')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ role: 'viewer' }))
    expect((init.headers as Record<string, string>)['X-Pihome-CSRF']).toBeDefined()
    expect(account.role).toBe('viewer')
  })

  it('escapes the name into the path', async () => {
    // Names cannot hold a slash today. If the rule ever loosens, this is what keeps
    // a name from becoming a different route.
    const fetchMock = stubFetch(jsonResponse(OLYA))

    await changeAccount('a/b', { disabled: true })

    expect(sent(fetchMock).path).toBe('/v1/users/a%2Fb')
  })
})

describe('deleteAccount', () => {
  it('deletes, and takes the 204 as done', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))

    await expect(deleteAccount('olya')).resolves.toBeUndefined()

    const { path, init } = sent(fetchMock)
    expect(path).toBe('/v1/users/olya')
    expect(init.method).toBe('DELETE')
  })
})

describe('issueInvitation', () => {
  it('posts to the account and returns the token', async () => {
    const fetchMock = stubFetch(
      jsonResponse({ token: 'one-time', expires_at: '2026-10-05T09:15:00Z' }, 201),
    )

    const invitation = await issueInvitation('olya')

    const { path, init } = sent(fetchMock)
    expect(path).toBe('/v1/users/olya/invitation')
    expect(init.method).toBe('POST')
    expect(invitation.token).toBe('one-time')
  })

  it('says a disabled account has to be enabled first', async () => {
    stubFetch(jsonResponse({ detail: 'disabled' }, 409))

    await expect(issueInvitation('olya')).rejects.toMatchObject({
      kind: 'conflict',
      message: expect.stringMatching(/disabled.*Enable it/) as unknown,
    })
  })

  it('reports an admin account as forbidden, which is what the hub says', async () => {
    stubFetch(jsonResponse({ detail: 'console only' }, 403))

    await expect(issueInvitation('roman')).rejects.toMatchObject({ kind: 'forbidden' })
  })
})

describe('revokeInvitation', () => {
  it('deletes the invitation, not the account', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))

    await revokeInvitation('olya')

    const { path, init } = sent(fetchMock)
    expect(path).toBe('/v1/users/olya/invitation')
    expect(init.method).toBe('DELETE')
  })
})
