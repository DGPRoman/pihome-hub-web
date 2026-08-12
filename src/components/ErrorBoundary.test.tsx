import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './ErrorBoundary'

function Boom({ thrown }: { readonly thrown: unknown }): never {
  throw thrown
}

beforeEach(() => {
  // React reports a caught error to the console itself. Silenced so a passing run
  // does not look like a failing one.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('ErrorBoundary', () => {
  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>the porch light</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('the porch light')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('replaces a crashed subtree with the reason, announced', () => {
    render(
      <ErrorBoundary>
        <Boom thrown={new Error('cannot read properties of undefined')} />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('cannot read properties of undefined')
  })

  it('describes a thrown value that is not an Error', () => {
    render(
      <ErrorBoundary>
        <Boom thrown="just a string" />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('just a string')
  })

  it('keeps reporting the failure until the reader asks for a retry', async () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Boom thrown={new Error('transient')} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // The next poll brings data that would render perfectly well.
    rerender(
      <ErrorBoundary>
        <p>recovered</p>
      </ErrorBoundary>,
    )

    // Still the failure: re-rendering on its own would loop against a crash that
    // is not transient, so recovery waits to be asked for.
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(screen.getByText('recovered')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
