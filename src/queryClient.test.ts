import { describe, expect, it } from 'vitest'

import { HubError, type HubErrorKind } from './api/errors'
import { REQUEST_TIMEOUT_MS } from './api/http'
import { sessionKeys } from './hooks/queryKeys'
import {
  createQueryClient,
  MAX_RETRIES,
  OFFERS_A_CREDENTIAL,
  POLL_INTERVAL_MS,
  STALE_TIME_MS,
} from './queryClient'
import { sessionAs } from './testing/renderWithQuery'

/** The retry predicate the shipped client actually uses. */
function retryPolicy(): (failureCount: number, error: HubError) => boolean {
  const configured = createQueryClient().getDefaultOptions().queries?.retry
  if (typeof configured !== 'function') {
    throw new Error('the query retry policy is no longer a predicate')
  }
  return configured
}

describe('createQueryClient', () => {
  it('never retries a write', () => {
    // The one with physical consequences. These writes close and open mains
    // circuits, and `retry: false` is the only thing standing between a flaky
    // network and a relay driven more than once from a single press. The suite
    // used to stay green with this set to 3, because every test built its own
    // client and overrode it.
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false)
  })

  /**
   * Every kind, and what should happen to it.
   *
   * A total Record rather than a list of pairs, so the compiler requires a row
   * per kind. A list would have stayed green while silently not covering a kind
   * added since — which is exactly how the policy itself used to be wrong.
   */
  const RETRY_EXPECTATIONS: Readonly<Record<HubErrorKind, boolean>> = {
    offline: true,
    server: true,
    timeout: true,
    unauthorized: false,
    'rate-limited': false,
    'not-found': false,
    malformed: false,
    // A role does not change between two attempts a few hundred milliseconds
    // apart, and each one is another failure the hub's limiter counts.
    forbidden: false,
    conflict: false,
    // The hub answered and the answer was unusable. On a read another go might
    // work; on a write this kind means the write already happened, and a retry
    // would be a second one.
    unreadable: false,
    // A captive portal answers identically until somebody signs in to it.
    'not-the-hub': false,
    unexpected: false,
  }

  it.each(Object.entries(RETRY_EXPECTATIONS))('retrying a %s failure is %s', (kind, expected) => {
    // Retrying a rejected key or an unknown relay repeats the same answer more
    // slowly. A timeout is worth another go: something is listening, and a Pi
    // part way through a reboot answers the connection before the request.
    expect(retryPolicy()(0, new HubError(kind as HubErrorKind, 'whatever'))).toBe(expected)
  })

  it('stops after the configured number of attempts', () => {
    const retry = retryPolicy()

    expect(retry(MAX_RETRIES - 1, new HubError('offline', 'x'))).toBe(true)
    expect(retry(MAX_RETRIES, new HubError('offline', 'x'))).toBe(false)
  })

  it('polls, and treats a recent read as fresh', () => {
    const queries = createQueryClient().getDefaultOptions().queries

    expect(queries?.refetchInterval).toBe(POLL_INTERVAL_MS)
    expect(queries?.staleTime).toBe(STALE_TIME_MS)
  })

  it('abandons a hung request before the next poll is due', () => {
    // Otherwise polls stack up behind one that is never going to answer. The two
    // numbers live in different modules, so their relationship is held here rather
    // than in a comment that can quietly stop being true.
    expect(REQUEST_TIMEOUT_MS).toBeLessThan(POLL_INTERVAL_MS)
  })

  it('treats a stale window shorter than the poll interval as deliberate', () => {
    // A read is reusable for less time than the gap between polls, so a poll
    // always fetches rather than being served from cache and doing nothing.
    expect(STALE_TIME_MS).toBeLessThan(POLL_INTERVAL_MS)
  })
})

describe('what a 401 from a write says about the session', () => {
  async function failWithA401(meta?: typeof OFFERS_A_CREDENTIAL) {
    const client = createQueryClient()
    client.setQueryData(sessionKeys.current, sessionAs('admin'))

    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(new HubError('unauthorized', 'refused', 401)),
      ...(meta === undefined ? {} : { meta }),
    })
    await mutation.execute(undefined).catch(() => undefined)

    return client.getQueryData(sessionKeys.current)
  }

  it('records that nobody is logged in, for a write made with the session', async () => {
    // The session ran out between two presses, and only the login form helps.
    await expect(failWithA401()).resolves.toBeNull()
  })

  it('leaves the session alone, for a write that offered a credential of its own', async () => {
    // An expired invitation link opened in a browser that is logged in already.
    // The hub refused the token and left the cookie as it was; forgetting the
    // session would show a login form to somebody who is still logged in.
    await expect(failWithA401(OFFERS_A_CREDENTIAL)).resolves.toStrictEqual(sessionAs('admin'))
  })
})
