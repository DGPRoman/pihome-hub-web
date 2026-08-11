import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as automationApi from '../api/automation'
import { HubError } from '../api/errors'
import type { AutomationRule } from '../api/types'
import { renderWithQuery } from '../testing/renderWithQuery'
import { RulePanel } from './RulePanel'

const PORCH: AutomationRule = {
  id: 'porch-motion-light',
  enabled: true,
  onlyAfterDark: true,
  when: { device: 'porch-motion', motion: true },
  then: { relay: 'porch-light', state: 'on', holdSeconds: 60 },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RulePanel', () => {
  it('is its own labelled region', async () => {
    vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([])

    renderWithQuery(<RulePanel />)

    expect(await screen.findByRole('region', { name: 'Automation' })).toBeInTheDocument()
  })

  it('states a rule as a sentence', async () => {
    vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([PORCH])

    renderWithQuery(<RulePanel />)

    expect(await screen.findByText(/when porch-motion detects motion/i)).toBeInTheDocument()
    expect(screen.getByText(/turn on porch-light/i)).toBeInTheDocument()
    expect(screen.getByText(/reverts after 60s/i)).toBeInTheDocument()
  })

  it('marks a rule that only fires after dark', async () => {
    vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([PORCH])

    renderWithQuery(<RulePanel />)

    expect(await screen.findByText('After dark')).toBeInTheDocument()
  })

  it('marks a disabled rule rather than hiding it', async () => {
    vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([{ ...PORCH, enabled: false }])

    renderWithQuery(<RulePanel />)

    expect(await screen.findByText('Disabled')).toBeInTheDocument()
  })

  it('omits the revert clause when the rule holds indefinitely', async () => {
    vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([
      { ...PORCH, then: { ...PORCH.then, holdSeconds: null } },
    ])

    renderWithQuery(<RulePanel />)

    expect(await screen.findByText(/turn on porch-light\./i)).toBeInTheDocument()
    expect(screen.queryByText(/reverts/i)).not.toBeInTheDocument()
  })

  it('distinguishes no rules from an unreadable hub', async () => {
    vi.spyOn(automationApi, 'fetchRules').mockResolvedValue([])

    renderWithQuery(<RulePanel />)

    expect(await screen.findByText(/no automation rules are configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a failure as an alert', async () => {
    vi.spyOn(automationApi, 'fetchRules').mockRejectedValue(
      new HubError('offline', 'The hub did not answer. Is it running?'),
    )

    renderWithQuery(<RulePanel />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The hub did not answer')
    })
  })
})
