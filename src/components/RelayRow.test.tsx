import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from '../api/errors'
import * as relaysApi from '../api/relays'
import { renderWithQuery } from '../testing/renderWithQuery'
import { RelayRow } from './RelayRow'

const PORCH_OFF = { id: 'porch-light', label: 'Porch light', on: false }
const PORCH_ON = { ...PORCH_OFF, on: true }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RelayRow', () => {
  it('is a switch named after the relay, reporting its state', () => {
    renderWithQuery(<RelayRow relay={PORCH_ON} />)

    // The accessible name is the label alone: the visible On/Off text is hidden
    // from assistive technology because aria-checked already carries the state.
    const control = screen.getByRole('switch', { name: 'Porch light' })
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('asks for the opposite of the state it is showing', async () => {
    const setRelay = vi.spyOn(relaysApi, 'setRelay').mockResolvedValue(PORCH_ON)

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

    // The desired state, not a toggle instruction — see setRelay in the API layer.
    expect(setRelay).toHaveBeenCalledWith('porch-light', true)
  })

  it('refuses further presses while a write is in flight', async () => {
    const setRelay = vi.spyOn(relaysApi, 'setRelay').mockReturnValue(
      new Promise(() => {
        // Never settles: models a write still in flight.
      }),
    )

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    const control = screen.getByRole('switch', { name: 'Porch light' })
    await userEvent.click(control)

    await waitFor(() => {
      expect(control).toHaveAttribute('aria-disabled', 'true')
    })
    expect(control).toHaveAttribute('aria-busy', 'true')

    // The refusal, not the attribute that used to imply it. `aria-disabled` is a
    // claim about the control and not a rule the browser enforces, so the handler
    // has to turn a second press away itself — and this is the assertion that
    // notices if it stops.
    await userEvent.click(control)
    await userEvent.click(control)
    expect(setRelay).toHaveBeenCalledTimes(1)
  })

  it('stays focusable while the write is in flight', async () => {
    // The bug this replaces: `disabled` makes an element unfocusable, so a browser
    // blurs it the moment the attribute lands. Pressing a switch with the keyboard
    // threw you to the top of the document, on every press, and the write is over
    // in milliseconds so there is nothing to see happen.
    //
    // jsdom does not implement that blur, so the symptom cannot be reproduced
    // here — this asserts the mechanism that prevents it instead. A browser check
    // is still owed; see the issue.
    vi.spyOn(relaysApi, 'setRelay').mockReturnValue(new Promise(() => {}))

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    const control = screen.getByRole('switch', { name: 'Porch light' })
    await userEvent.click(control)

    await waitFor(() => {
      expect(control).toHaveAttribute('aria-disabled', 'true')
    })
    expect(control).not.toBeDisabled()
    expect(control).toHaveFocus()
  })

  it('announces a successful switch, not only a refused one', async () => {
    // Only failure was announced, so the one outcome that went by in silence was a
    // mains circuit actually changing state.
    vi.spyOn(relaysApi, 'setRelay').mockResolvedValue(PORCH_ON)

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

    // status, not alert: an alert interrupts, and a switch doing what it was asked
    // is not an interruption.
    expect(await screen.findByRole('status')).toHaveTextContent('Porch light off')
  })

  it('says nothing before anything has been pressed', () => {
    vi.spyOn(relaysApi, 'setRelay').mockResolvedValue(PORCH_ON)

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)

    // The live region is in the document from the start — a region announced only
    // once it appears is a region screen readers may not have been watching — so
    // what matters is that it is empty until there is something to say.
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('announces a refused write instead of failing silently', async () => {
    vi.spyOn(relaysApi, 'setRelay').mockRejectedValue(
      new HubError('unauthorized', 'The hub rejected the API key.', 401),
    )

    renderWithQuery(<RelayRow relay={PORCH_OFF} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The hub rejected the API key.')
  })

  describe('when the hub accepted the write and answered unreadably', () => {
    const unreadable = () =>
      vi
        .spyOn(relaysApi, 'setRelay')
        .mockRejectedValue(
          new HubError('unreadable', 'The hub answered, but this app could not read the reply.'),
        )

    it('does not present it as a failure', async () => {
      unreadable()

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      // status, not alert. The circuit is where they asked for it; only the
      // confirmation was lost, and an alert would send them to fix nothing.
      expect(await screen.findByRole('status')).toHaveTextContent('Rechecking with the hub')
      expect(screen.queryByRole('alert')).toBeNull()
      // And visibly, for somebody who is looking at it.
      expect(screen.getByText(/The switch may have moved/)).toBeInTheDocument()
    })

    it('marks the state as unconfirmed rather than showing it as settled', async () => {
      unreadable()

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      await screen.findByRole('status')
      // The row is rendered with a fixed prop here, so the state shown is the one
      // it was given; what matters is that it is marked as not settled.
      expect(screen.getByText(/^(On|Off)\?$/)).toBeInTheDocument()
      expect(screen.queryByText('Off', { exact: true })).toBeNull()
    })

    it('describes the switch with the doubt, since a switch cannot announce mixed', async () => {
      unreadable()

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      // The note is visible text with an id, not a live region of its own — the
      // hidden region above announces it, and two regions describing one press
      // would compete.
      const note = await screen.findByText(/The switch may have moved/)
      const control = screen.getByRole('switch', { name: 'Porch light' })
      expect(control).toHaveAttribute('aria-describedby', note.id)
    })

    it('stops saying so once the hub has spoken since the write', async () => {
      unreadable()
      const { queryClient, rerender } = renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))
      await screen.findByRole('status')

      // The reconciling read landing, and the panel handing the row down what it
      // said. Derived from the two timestamps the client already keeps, so nothing
      // has to remember to clear it — and nothing can forget to.
      queryClient.setQueryData(['relays'], [PORCH_ON])
      rerender(<RelayRow relay={PORCH_ON} />)

      await waitFor(() => {
        expect(screen.queryByText(/The switch may have moved/)).toBeNull()
      })
      // The live region stays in the document — one that appears only when it has
      // something to say may not be announced at all — so what clears is its text.
      expect(screen.getByRole('status')).toBeEmptyDOMElement()
      expect(screen.getByText('On')).toBeInTheDocument()
    })

    it('still reports an ordinary refusal as a failure', async () => {
      vi.spyOn(relaysApi, 'setRelay').mockRejectedValue(
        new HubError('offline', 'The hub did not answer. Is it running?'),
      )

      renderWithQuery(<RelayRow relay={PORCH_OFF} />)
      await userEvent.click(screen.getByRole('switch', { name: 'Porch light' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('The hub did not answer')
      expect(screen.queryByText('Off?')).toBeNull()
    })
  })
})
