import { describe, expect, it } from 'vitest'

import { HubError, type HubErrorKind } from './api/errors'
import { REQUEST_TIMEOUT_MS } from './api/http'
import { createQueryClient, MAX_RETRIES, POLL_INTERVAL_MS, STALE_TIME_MS } from './queryClient'

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

  it.each([
    ['offline', true],
    ['server', true],
    ['timeout', true],
    ['unauthorized', false],
    ['rate-limited', false],
    ['not-found', false],
    ['malformed', false],
    ['unexpected', false],
  ] as const satisfies readonly (readonly [HubErrorKind, boolean])[])(
    'retrying a %s failure is %s',
    (kind, expected) => {
      // Retrying a rejected key or an unknown relay repeats the same answer more
      // slowly. A timeout is worth another go: something is listening, and a Pi
      // part way through a reboot answers the connection before the request.
      expect(retryPolicy()(0, new HubError(kind, 'whatever'))).toBe(expected)
    },
  )

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
