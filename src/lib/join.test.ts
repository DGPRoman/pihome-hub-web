import { describe, expect, it, vi } from 'vitest'

import { invitationLink, JOIN_PATH, namesOnlyThisDevice, readLanding } from './join'

function landing(pathname: string, hash = '') {
  const history = { replaceState: vi.fn<History['replaceState']>() }
  return { result: readLanding({ pathname, hash }, history), history }
}

describe('invitationLink', () => {
  it('puts the token after #, which a browser never sends to a server', () => {
    expect(invitationLink('http://hub.local:5002', 'abc-123_XYZ')).toBe(
      'http://hub.local:5002/join#abc-123_XYZ',
    )
  })

  it('round-trips through readLanding', () => {
    const url = new URL(invitationLink('http://hub.local:5002', 'abc-123_XYZ'))

    expect(landing(url.pathname, url.hash).result).toStrictEqual({
      page: 'join',
      token: 'abc-123_XYZ',
    })
  })
})

describe('readLanding', () => {
  it('lands anywhere else on the house, and leaves the address alone', () => {
    const { result, history } = landing('/', '#abc')

    expect(result).toStrictEqual({ page: 'house' })
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('reads the token from the join link', () => {
    expect(landing('/join', '#one-time').result).toStrictEqual({
      page: 'join',
      token: 'one-time',
    })
  })

  it('takes the token out of the address as it reads it', () => {
    // Off the address bar, out of this tab's history entry, and off the next
    // screenshot. The link the person was sent still has it.
    const { history } = landing('/join', '#one-time')

    expect(history.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', JOIN_PATH)
  })

  it('takes a trailing slash, which some apps add to a link they pass on', () => {
    expect(landing('/join/', '#one-time').result).toStrictEqual({
      page: 'join',
      token: 'one-time',
    })
  })

  it.each([
    ['no fragment at all', ''],
    ['an empty fragment', '#'],
    ['only whitespace', '# '],
  ])('says there is no token for %s', (_name, hash) => {
    expect(landing('/join', hash).result).toStrictEqual({ page: 'join', token: null })
  })

  it('does not treat a path that merely starts with /join as the join page', () => {
    expect(landing('/joined', '#one-time').result).toStrictEqual({ page: 'house' })
  })
})

describe('namesOnlyThisDevice', () => {
  it.each(['localhost', 'hub.localhost', '127.0.0.1', '127.1.2.3', '[::1]'])(
    'is true for %s',
    (hostname) => {
      expect(namesOnlyThisDevice(hostname)).toBe(true)
    },
  )

  it.each(['hub.local', '192.0.2.10', 'pihome', '[fe80::1]', 'localhost.example'])(
    'is false for %s',
    (hostname) => {
      expect(namesOnlyThisDevice(hostname)).toBe(false)
    },
  )
})
