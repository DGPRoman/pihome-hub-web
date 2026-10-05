import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { invitationLink, namesOnlyThisDevice } from '../lib/join'
import { renderWithQuery, sessionAs } from '../testing/renderWithQuery'

import { InvitationCard } from './InvitationCard'

describe('InvitationCard', () => {
  it('warns that a link built on localhost opens only this device', () => {
    // This file runs at jsdom's default address, which is localhost — the address
    // an admin has on the Pi itself, or on the development server.
    expect(namesOnlyThisDevice(window.location.hostname)).toBe(true)

    renderWithQuery(
      <InvitationCard
        username="olya"
        invitation={{ token: 'one-time', expiresAt: new Date(Date.now() + 60_000) }}
        link={invitationLink(window.location.origin, 'one-time')}
        gone={false}
        namesOnlyThisDevice={namesOnlyThisDevice(window.location.hostname)}
        inviting={false}
        onInviteAgain={() => {}}
        onClose={() => {}}
      />,
      { session: sessionAs('admin') },
    )

    expect(screen.getByRole('alert')).toHaveTextContent('only works on this device')
  })
})
