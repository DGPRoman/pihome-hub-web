import { useQuery } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithQuery } from '../testing/renderWithQuery'
import { DataPanel } from './DataPanel'

/** A panel over one relay id, so only the render prop varies between tests. */
function Panel({ children }: { readonly children: (data: readonly string[]) => ReactNode }) {
  const query = useQuery({
    queryKey: ['ids'],
    queryFn: (): readonly string[] => ['porch-light'],
  })

  return (
    <DataPanel
      heading="Relays"
      query={query}
      loadingMessage="Reading relays…"
      emptyMessage="No relays are configured."
      isEmpty={(ids) => ids.length === 0}
    >
      {children}
    </DataPanel>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DataPanel', () => {
  it('renders what the query returned', async () => {
    renderWithQuery(<Panel>{(ids) => <p>{ids.join(', ')}</p>}</Panel>)

    expect(await screen.findByText('porch-light')).toBeInTheDocument()
  })

  it('keeps its heading and reports the reason when its contents crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    renderWithQuery(
      <Panel>
        {() => {
          throw new Error('rendering a relay failed')
        }}
      </Panel>,
    )

    // The section survives its contents: still findable by its accessible name,
    // so the sections beside it are unaffected too.
    expect(await screen.findByRole('alert')).toHaveTextContent('rendering a relay failed')
    expect(screen.getByRole('region', { name: 'Relays' })).toBeInTheDocument()
  })
})
