import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithQuery } from '../testing/renderWithQuery'
import { RelayList } from './RelayList'

const RELAYS = [
  { id: 'porch-light', label: 'Porch light', on: true },
  { id: 'gate-light', label: 'Gate light', on: false },
]

describe('RelayList', () => {
  it('renders one switch per relay it was given', () => {
    renderWithQuery(<RelayList relays={RELAYS} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('switch', { name: 'Porch light' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('switch', { name: 'Gate light' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('states on and off in text as well, not by colour alone', () => {
    renderWithQuery(<RelayList relays={RELAYS} />)

    const [porch, gate] = screen.getAllByRole('listitem')
    expect(porch).toHaveTextContent('On')
    expect(gate).toHaveTextContent('Off')
  })

  it('renders nothing but an empty list for no relays', () => {
    renderWithQuery(<RelayList relays={[]} />)

    expect(screen.getByRole('list')).toBeEmptyDOMElement()
  })
})
