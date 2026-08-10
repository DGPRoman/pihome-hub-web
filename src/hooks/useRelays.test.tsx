import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as relaysApi from '../api/relays'
import { useRelays } from './useRelays'

const RELAYS = [{ id: 'porch-light', label: 'Porch light', on: true }]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useRelays', () => {
  it('starts out loading, before anything has been awaited', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    const { result } = renderHook(() => useRelays())

    expect(result.current.status).toBe('loading')
  })

  it('reaches success carrying the relays', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue(RELAYS)

    const { result } = renderHook(() => useRelays())

    await waitFor(() => {
      expect(result.current.status).toBe('success')
    })
    // Narrowed by the assertion above, so `data` is reachable without a cast.
    if (result.current.status !== 'success') throw new Error('unreachable')
    expect(result.current.data).toEqual(RELAYS)
  })

  it('reaches failure carrying the error the client raised', async () => {
    const error = new HubError('unauthorized', 'The hub rejected the API key.', 401)
    vi.spyOn(relaysApi, 'fetchRelays').mockRejectedValue(error)

    const { result } = renderHook(() => useRelays())

    await waitFor(() => {
      expect(result.current.status).toBe('failure')
    })
    if (result.current.status !== 'failure') throw new Error('unreachable')
    expect(result.current.error).toBe(error)
  })

  it('turns an unexpected throw into a HubError rather than crashing the render', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockRejectedValue(new TypeError('undefined is not a fn'))

    const { result } = renderHook(() => useRelays())

    await waitFor(() => {
      expect(result.current.status).toBe('failure')
    })
    if (result.current.status !== 'failure') throw new Error('unreachable')
    expect(result.current.error.kind).toBe('unexpected')
  })

  it('aborts the request when the component unmounts', () => {
    const signals: (AbortSignal | null)[] = []
    vi.spyOn(relaysApi, 'fetchRelays').mockImplementation((signal = null) => {
      signals.push(signal)
      return new Promise(() => {
        // Never settles: this models a request still in flight at unmount.
      })
    })

    const { unmount } = renderHook(() => useRelays())
    expect(signals[0]?.aborted).toBe(false)

    unmount()

    expect(signals[0]?.aborted).toBe(true)
  })

  it('ignores a request that resolves after being aborted', async () => {
    // The failure this guards against is a discarded request writing state over
    // a newer one. Resolving after the abort must leave the hook untouched.
    let settle: ((relays: typeof RELAYS) => void) | undefined
    vi.spyOn(relaysApi, 'fetchRelays').mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      }),
    )

    const { result, unmount } = renderHook(() => useRelays())
    unmount()
    settle?.(RELAYS)

    await Promise.resolve()
    expect(result.current.status).toBe('loading')
  })
})
