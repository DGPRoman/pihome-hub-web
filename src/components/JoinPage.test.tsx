import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as androidApi from '../api/androidApp'
import { HubError } from '../api/errors'
import * as sessionApi from '../api/session'
import { renderWithQuery } from '../testing/renderWithQuery'
import { JoinPage } from './JoinPage'

const ANDROID =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const SHA256 = 'c'.repeat(64)
const ORIGIN = window.location.origin

function show(userAgent: string, token: string | null = 'one-time') {
  return renderWithQuery(<JoinPage token={token} onDone={vi.fn()} userAgent={userAgent} />, {
    session: null,
  })
}

beforeEach(() => {
  vi.spyOn(sessionApi, 'fetchSession').mockResolvedValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('on an Android phone', () => {
  it('offers the app first, with the invitation, falling back to the APK on this hub', async () => {
    vi.spyOn(androidApi, 'fetchAndroidApp').mockResolvedValue({ sha256: SHA256, size: 29_540_817 })

    show(ANDROID)

    // Once the hub has said it has an APK, which is what the link falls back to.
    const download = await screen.findByRole('link', { name: 'Download the app' })
    const open = screen.getByRole('link', { name: 'Open in the pihome app' })
    expect(open).toHaveAttribute(
      'href',
      `intent://join?hub=${encodeURIComponent(ORIGIN)}&token=one-time` +
        '#Intent;scheme=pihome;package=io.github.dgproman.pihome;' +
        `S.browser_fallback_url=${encodeURIComponent(`${ORIGIN}/app/pihome.apk`)};end`,
    )
    expect(download).toHaveAttribute('href', '/app/pihome.apk')
    expect(screen.getByText(/29\.5 MB/)).toBeInTheDocument()
    expect(screen.getByText(SHA256)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join in this browser' })).toBeInTheDocument()
  })

  it('without an APK on the hub, offers no download, and falls back to this invitation', async () => {
    vi.spyOn(androidApi, 'fetchAndroidApp').mockResolvedValue(null)

    show(ANDROID)

    const open = await screen.findByRole('link', { name: 'Open in the pihome app' })
    expect(open.getAttribute('href')).toContain(
      `S.browser_fallback_url=${encodeURIComponent(`${ORIGIN}/join#one-time`)};end`,
    )
    expect(screen.queryByRole('link', { name: 'Download the app' })).toBeNull()
  })

  it('stops offering the app once the hub has refused the invitation', async () => {
    vi.spyOn(androidApi, 'fetchAndroidApp').mockResolvedValue(null)
    vi.spyOn(sessionApi, 'joinWithInvitation').mockRejectedValue(
      new HubError('unauthorized', sessionApi.INVITATION_REFUSED, 401),
    )

    show(ANDROID)
    await userEvent.click(await screen.findByRole('button', { name: 'Join in this browser' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(sessionApi.INVITATION_REFUSED)
    expect(screen.queryByRole('link', { name: 'Open in the pihome app' })).toBeNull()
  })

  it('offers nothing when the address carried no invitation', () => {
    const fetchApp = vi.spyOn(androidApi, 'fetchAndroidApp').mockResolvedValue(null)

    show(ANDROID, null)

    expect(screen.queryByRole('link', { name: 'Open in the pihome app' })).toBeNull()
    expect(fetchApp).not.toHaveBeenCalled()
  })
})

describe('anywhere else', () => {
  it('is the browser join alone, and does not ask about the app', async () => {
    const fetchApp = vi.spyOn(androidApi, 'fetchAndroidApp').mockResolvedValue(null)

    show(DESKTOP)

    expect(await screen.findByRole('button', { name: 'Join' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open in the pihome app' })).toBeNull()
    expect(fetchApp).not.toHaveBeenCalled()
  })
})
