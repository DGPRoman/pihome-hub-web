import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as relaysApi from '../api/relays'
import type { Relay } from '../api/types'
import { CANNOT_CHANGE_THE_HOUSE } from '../lib/roles'
import { renderWithQuery, sessionAs } from '../testing/renderWithQuery'
import { RelayPanel } from './RelayPanel'

const PORCH_OFF = { id: 'porch-light', label: 'Porch light', on: false }
const GATE_OFF = { id: 'gate-light', label: 'Gate light', on: false }
const PORCH_ON = { ...PORCH_OFF, on: true }
const GATE_ON = { ...GATE_OFF, on: true }

/** A promise the test settles by hand, to hold a request in flight. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle
    reject = fail
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * Render the panel as somebody who may switch a circuit.
 *
 * Most of what follows is about what a write *does*, which needs an account
 * allowed to make one. Who that is gets said here rather than in each test, and
 * the tests that are about the role say so themselves.
 */
function renderAsOperator() {
  return renderWithQuery(<RelayPanel />, { session: sessionAs('operator') })
}

describe('RelayPanel', () => {
  it('is labelled by its heading', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    renderAsOperator()

    expect(screen.getByRole('region', { name: 'Relays' })).toBeInTheDocument()
  })

  it('announces that it is loading while the first read is in flight', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockReturnValue(deferred<readonly Relay[]>().promise)

    renderAsOperator()

    expect(screen.getByRole('status')).toHaveTextContent('Reading relay state')
  })

  it('shows the relays once they arrive', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF, GATE_OFF])

    renderAsOperator()

    expect(await screen.findByRole('switch', { name: 'Porch light' })).toBeInTheDocument()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    // One live region per row, empty until that row has something to announce.
    // They are in the document from the start on purpose: a region the browser has
    // not been watching may not be announced at all when it appears.
    expect(screen.getAllByRole('status')).toHaveLength(2)
    for (const region of screen.getAllByRole('status')) {
      expect(region).toBeEmptyDOMElement()
    }
  })

  it('distinguishes a hub with no relays from a hub that could not be read', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([])

    renderAsOperator()

    expect(await screen.findByText(/no relays are configured/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the failure as an alert when nothing has ever arrived', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockRejectedValue(
      new HubError('offline', 'The hub did not answer. Is it running?'),
    )

    renderAsOperator()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('The hub did not answer')
    })
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('flips the switch before the hub has confirmed it', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])
    const write = deferred<Relay>()
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(write.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    // The write has not resolved. What is on screen is the optimistic value,
    // written straight into the cache, which is the whole point of doing it.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Porch light' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    write.resolve({ ...PORCH_OFF, on: true })
  })

  it('does not leave the switch flipped when the hub refuses the write', async () => {
    // Both requests are driven by hand. The reconciling read is never answered, so
    // the state this ends on can only have come from the snapshot — letting it
    // answer would restore the switch by itself and the test would pass with the
    // rollback deleted.
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_OFF])
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const write = deferred<Relay>()
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(write.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    const porch = () => screen.getByRole('switch', { name: 'Porch light' })
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'true')
    })

    write.reject(new HubError('rate-limited', 'The hub is refusing further attempts for now.', 429))

    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('does not undo a write the hub accepted but answered unreadably', async () => {
    // Driven by hand for the same reason as the test above: the reconciling read
    // is never answered, so the state this ends on can only be the one the write
    // put there. Letting the read answer would settle it either way and the test
    // would pass with the change removed.
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_OFF])
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const write = deferred<Relay>()
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(write.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    const porch = () => screen.getByRole('switch', { name: 'Porch light' })
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'true')
    })

    // A 2xx whose body the parser rejects. The circuit moved; only the
    // confirmation was lost. Rolling back here showed the switch in its old
    // position while the mains was in the new one, and the operator's likely
    // response — press it again — is a second write.
    write.reject(
      new HubError('unreadable', 'The hub answered, but this app could not read the reply.'),
    )

    await screen.findByText(/The switch may have moved/)
    expect(porch()).toHaveAttribute('aria-checked', 'true')
  })

  it('does not undo a bulk write the hub accepted but answered unreadably', async () => {
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_ON, GATE_OFF])
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const write = deferred<readonly Relay[]>()
    vi.spyOn(relaysApi, 'setAllRelays').mockReturnValue(write.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('button', { name: 'All off' }))

    const porch = () => screen.getByRole('switch', { name: 'Porch light' })
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'false')
    })

    write.reject(
      new HubError('unreadable', 'The hub answered, but this app could not read the reply.'),
    )

    // Waited on the note, not on the state. The relays are already where this
    // asserts they should be, so a waitFor over them would pass on the first tick
    // and never see the rollback — which is exactly how this test passed with the
    // change removed the first time it was written.
    // The bulk button's own note, not a row's: the rows have live regions now too,
    // so this waits on the text rather than on the role.
    await screen.findByText(/Rechecking with the hub/)
    expect(porch()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Gate light' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('leaves other relays usable while one write is in flight', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF, GATE_OFF])
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(deferred<Relay>().promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    // Each row owns its own mutation, so a shared pending flag cannot grey out
    // the whole list. `aria-disabled` rather than `disabled`, because a disabled
    // element is not focusable and pressing a switch used to throw a keyboard user
    // back to the top of the document — see RelayRow.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Porch light' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })
    expect(screen.getByRole('switch', { name: 'Gate light' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('offers no bulk control until the hub has said what there is to switch off', () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockReturnValue(deferred<readonly Relay[]>().promise)

    renderAsOperator()

    expect(screen.queryByRole('button', { name: 'All off' })).not.toBeInTheDocument()
  })

  it('opens every relay before the hub has confirmed it', async () => {
    vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_ON, GATE_ON])
    const write = deferred<readonly Relay[]>()
    vi.spyOn(relaysApi, 'setAllRelays').mockReturnValue(write.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('button', { name: 'All off' }))

    await waitFor(() => {
      for (const control of screen.getAllByRole('switch')) {
        expect(control).toHaveAttribute('aria-checked', 'false')
      }
    })

    write.resolve([PORCH_OFF, GATE_OFF])
  })

  it('leaves every relay as it was when the hub refuses the bulk write', async () => {
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_ON, GATE_OFF])
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const write = deferred<readonly Relay[]>()
    vi.spyOn(relaysApi, 'setAllRelays').mockReturnValue(write.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('button', { name: 'All off' }))

    const porch = () => screen.getByRole('switch', { name: 'Porch light' })
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'false')
    })

    write.reject(new HubError('rate-limited', 'The hub is refusing further attempts for now.', 429))

    // Each relay goes back to what it held before the button was pressed, so the
    // porch light returns to on. A rollback that inverted instead would be wrong
    // for the gate light, which was already off.
    await waitFor(() => {
      expect(porch()).toHaveAttribute('aria-checked', 'true')
    })
    expect(screen.getByRole('switch', { name: 'Gate light' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('reports a refused write without waiting for the reconciling read', async () => {
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_ON])
    // The read that follows the write never answers — a hub that accepts the
    // connection and then stalls. No request in this client has a deadline.
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const write = deferred<Relay>()
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(write.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

    write.reject(new HubError('unauthorized', 'The hub rejected the API key.', 401))

    // Both of these once waited on the refetch above: the mutation core awaits
    // whatever onSettled returns before it dispatches the terminal state, so a
    // write the hub had refused showed no error and kept its switch disabled for
    // as long as the follow-up read took — here, forever.
    expect(await screen.findByRole('alert')).toHaveTextContent('rejected the API key')
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Porch light' })).toBeEnabled()
    })
  })

  it('invents no state when two refused writes overlap', async () => {
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_ON, GATE_ON])
    // Deliberately never answered. A reconciling read would paper over this, and
    // it is exactly what cannot be relied on in the case that causes it.
    fetch.mockReturnValue(deferred<readonly Relay[]>().promise)
    const one = deferred<Relay>()
    const all = deferred<readonly Relay[]>()
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(one.promise)
    vi.spyOn(relaysApi, 'setAllRelays').mockReturnValue(all.promise)

    renderAsOperator()
    await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))
    await userEvent.click(screen.getByRole('button', { name: 'All off' }))

    const refused = () => new HubError('server', 'The hub could not complete the request.', 500)
    one.reject(refused())
    all.reject(refused())

    // The hub reported both on and refused both writes, so both must read on.
    // Restoring each snapshot whole used to settle on porch off and gate on — a
    // combination the hub never reported, under a banner claiming it had.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Porch light' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })
    expect(screen.getByRole('switch', { name: 'Gate light' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('keeps showing the last known state when a refresh fails', async () => {
    const fetch = vi.spyOn(relaysApi, 'fetchRelays')
    fetch.mockResolvedValueOnce([PORCH_OFF])
    fetch.mockRejectedValue(new HubError('offline', 'The hub did not answer. Is it running?'))

    const { queryClient } = renderAsOperator()
    expect(await screen.findByRole('switch', { name: 'Porch light' })).toBeInTheDocument()

    await queryClient.refetchQueries({ queryKey: ['relays'] })

    // A failed poll must not blank a working list. The warning says the data is
    // stale; throwing it away would discard something true.
    expect(await screen.findByRole('alert')).toHaveTextContent('last state the hub reported')
    expect(screen.getByRole('switch', { name: 'Porch light' })).toBeInTheDocument()
  })
  /**
   * What each role is shown.
   *
   * The hub refuses a write from a viewer whatever this does, so none of this is
   * a security boundary — it is the difference between being told no after
   * pressing something and being told beforehand why it is not yours to press.
   */
  describe('as a viewer', () => {
    function renderAsViewer() {
      return renderWithQuery(<RelayPanel />, { session: sessionAs('viewer') })
    }

    it('still shows every switch', async () => {
      // Shown, not hidden. A control that vanishes says the feature does not
      // exist, and somebody who has been given the wrong role would have no way
      // to tell that from a hub with no relays configured.
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF, GATE_OFF])

      renderAsViewer()

      expect(await screen.findByRole('switch', { name: 'Porch light' })).toBeInTheDocument()
      expect(screen.getAllByRole('switch')).toHaveLength(2)
    })

    it('marks them unavailable without taking them out of the tab order', async () => {
      // `aria-disabled`, not `disabled`: a disabled control cannot be focused, so
      // the description explaining it would be unreachable by the people most
      // likely to need it.
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])

      renderAsViewer()
      const relay = await screen.findByRole('switch', { name: 'Porch light' })

      expect(relay).toHaveAttribute('aria-disabled', 'true')
      expect(relay).not.toBeDisabled()
    })

    it('explains why, as the accessible description of the switch itself', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])

      renderAsViewer()
      const relay = await screen.findByRole('switch', { name: 'Porch light' })

      expect(relay).toHaveAccessibleDescription(CANNOT_CHANGE_THE_HOUSE)
      expect(screen.getByText(CANNOT_CHANGE_THE_HOUSE)).toBeInTheDocument()
    })

    it('says it once for the section, not once per relay', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF, GATE_OFF])

      renderAsViewer()
      await screen.findByRole('switch', { name: 'Porch light' })

      expect(screen.getAllByText(CANNOT_CHANGE_THE_HOUSE)).toHaveLength(1)
    })

    it('sends no write when a switch is pressed', async () => {
      // The hub would refuse it. Not sending it spares the reader a round trip
      // and the hub's failure limiter a count against this browser.
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])
      const setRelay = vi.spyOn(relaysApi, 'setRelay')

      renderAsViewer()
      await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

      expect(setRelay).not.toHaveBeenCalled()
    })

    it('leaves the switch showing what the hub said', async () => {
      // No optimistic flip on a press that was never sent.
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])

      renderAsViewer()
      const relay = await screen.findByRole('switch', { name: 'Porch light' })
      await userEvent.click(relay)

      expect(relay).toHaveAttribute('aria-checked', 'false')
    })

    it('marks All off unavailable and explains that too', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_ON])

      renderAsViewer()
      const allOff = await screen.findByRole('button', { name: 'All off' })

      expect(allOff).toHaveAttribute('aria-disabled', 'true')
      expect(allOff).toHaveAccessibleDescription(CANNOT_CHANGE_THE_HOUSE)
    })

    it('sends no bulk write either', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_ON])
      const setAllRelays = vi.spyOn(relaysApi, 'setAllRelays')

      renderAsViewer()
      await userEvent.click(await screen.findByRole('button', { name: 'All off' }))

      expect(setAllRelays).not.toHaveBeenCalled()
    })
  })

  describe.each(['operator', 'admin'] as const)('as %s', (role) => {
    function renderAsRole() {
      return renderWithQuery(<RelayPanel />, { session: sessionAs(role) })
    }

    it('the switches are usable and nothing is explained away', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])

      renderAsRole()
      const relay = await screen.findByRole('switch', { name: 'Porch light' })

      expect(relay).toHaveAttribute('aria-disabled', 'false')
      expect(screen.queryByText(CANNOT_CHANGE_THE_HOUSE)).not.toBeInTheDocument()
    })

    it('a press reaches the hub', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])
      const setRelay = vi.spyOn(relaysApi, 'setRelay').mockResolvedValue(PORCH_ON)

      renderAsRole()
      await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

      expect(setRelay).toHaveBeenCalledWith('porch-light', true)
    })
  })

  describe('when the hub refuses a write this client thought was allowed', () => {
    /**
     * An admin lowering somebody to `viewer` while their page is open, which the
     * hub applies on the very next request — it re-reads the account every time.
     * The client's own check said yes, because it is working from a session read
     * before that happened.
     */
    it('reports it as a refusal of the account, not as a broken app', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])
      vi.spyOn(relaysApi, 'setRelay').mockRejectedValue(
        new HubError('forbidden', 'This account is not allowed to do that. Ask an admin.', 403),
      )

      renderAsOperator()
      await userEvent.click(await screen.findByRole('switch', { name: 'Porch light' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('not allowed')
      expect(screen.getByRole('alert')).not.toHaveTextContent('403')
    })

    it('puts the switch back where the hub last said it was', async () => {
      vi.spyOn(relaysApi, 'fetchRelays').mockResolvedValue([PORCH_OFF])
      vi.spyOn(relaysApi, 'setRelay').mockRejectedValue(
        new HubError('forbidden', 'This account is not allowed to do that.', 403),
      )

      renderAsOperator()
      const relay = await screen.findByRole('switch', { name: 'Porch light' })
      await userEvent.click(relay)

      await waitFor(() => {
        expect(relay).toHaveAttribute('aria-checked', 'false')
      })
    })
  })
  /**
   * Where the pressed switch leaves the keyboard.
   *
   * RelayRow already holds the half of this it can see: a switch stays focusable
   * while its own write is in flight. The other half is only visible from here,
   * because it is about the list — the reconciling read answers, the panel
   * re-renders every row, and whether focus survives that depends on React
   * matching each relay to the DOM node it already had.
   */
  describe('keyboard focus across a write', () => {
    it('stays on the switch that was pressed', async () => {
      const fetchRelays = vi.spyOn(relaysApi, 'fetchRelays')
      fetchRelays.mockResolvedValue([PORCH_OFF, GATE_OFF])
      vi.spyOn(relaysApi, 'setRelay').mockResolvedValue(PORCH_ON)

      renderAsOperator()
      const porch = await screen.findByRole('switch', { name: 'Porch light' })

      // What the reconciling read will answer with, which re-renders the list.
      fetchRelays.mockResolvedValue([PORCH_ON, GATE_OFF])
      await userEvent.click(porch)

      await waitFor(() => {
        expect(porch).toHaveAttribute('aria-checked', 'true')
      })
      expect(porch).toHaveFocus()
    })

    it('stays on it even when the list comes back in a different order', async () => {
      // The hub returns relays in configuration order and nothing in its contract
      // promises that never changes. This is the case that tells a stable key from
      // a positional one: with `key={index}` React reuses the first row's DOM node
      // for whatever is now first, and the focus goes with the node rather than
      // with the relay.
      const fetchRelays = vi.spyOn(relaysApi, 'fetchRelays')
      fetchRelays.mockResolvedValue([PORCH_OFF, GATE_OFF])
      vi.spyOn(relaysApi, 'setRelay').mockResolvedValue(PORCH_ON)

      renderAsOperator()
      const porch = await screen.findByRole('switch', { name: 'Porch light' })

      fetchRelays.mockResolvedValue([GATE_OFF, PORCH_ON])
      await userEvent.click(porch)

      await waitFor(() => {
        expect(screen.getAllByRole('switch')[0]).toHaveAccessibleName('Gate light')
      })
      expect(screen.getByRole('switch', { name: 'Porch light' })).toHaveFocus()
    })
  })
})
