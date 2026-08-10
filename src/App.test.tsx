import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders the application title', () => {
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'pihome-hub' })).toBeInTheDocument()
  })

  it('labels the relay section for assistive technology', () => {
    render(<App />)

    expect(screen.getByRole('region', { name: 'Relays' })).toBeInTheDocument()
  })
})
