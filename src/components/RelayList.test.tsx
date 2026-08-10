import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RelayList } from './RelayList'

const RELAYS = [
  { id: 'porch-light', label: 'Porch light', on: true },
  { id: 'gate-light', label: 'Gate light', on: false },
]

describe('RelayList', () => {
  it('lists every relay it was given', () => {
    render(<RelayList relays={RELAYS} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Porch light')).toBeInTheDocument()
    expect(screen.getByText('Gate light')).toBeInTheDocument()
  })

  it('states on and off in text, not by colour alone', () => {
    render(<RelayList relays={RELAYS} />)

    // Queried through the accessibility tree: this is the same information a
    // screen reader would announce, which is the point of asserting on it.
    const [porch, gate] = screen.getAllByRole('listitem')
    expect(porch).toHaveTextContent('On')
    expect(gate).toHaveTextContent('Off')
  })

  it('renders nothing but an empty list for no relays', () => {
    render(<RelayList relays={[]} />)

    expect(screen.getByRole('list')).toBeEmptyDOMElement()
  })
})
