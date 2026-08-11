import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as relaysApi from './api/relays'
import { App } from './App'
import { renderWithQuery } from './testing/renderWithQuery'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the application title and the relay section', () => {
    // Stubbed because the panel reads on mount. What each state looks like is
    // RelayPanel's concern; this only asserts the shell puts it on the page.
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    renderWithQuery(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'pihome-hub' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Relays' })).toBeInTheDocument()
  })
})
