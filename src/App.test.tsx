import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as automationApi from './api/automation'
import * as relaysApi from './api/relays'
import * as sensorsApi from './api/sensors'
import { App } from './App'
import { renderWithQuery } from './testing/renderWithQuery'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the title and one labelled region per section', () => {
    // Stubbed because both panels read on mount. What each state looks like is
    // the panels' concern; this only asserts the shell puts them on the page.
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])
    vi.spyOn(sensorsApi, 'fetchSensors').mockResolvedValue([])
    vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([])

    renderWithQuery(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'pihome-hub' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Relays' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Sensors' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Automation' })).toBeInTheDocument()
  })
})
