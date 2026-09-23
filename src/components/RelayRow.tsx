import { useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'

import type { Relay } from '../api/types'
import { relayKeys } from '../hooks/queryKeys'
import { useSetRelay } from '../hooks/useSetRelay'

import styles from './RelayRow.module.css'

interface RelayRowProps {
  readonly relay: Relay
  /**
   * Element saying why this switch cannot be used, or `null` when it can.
   *
   * Doubles as the answer to whether it can: a row does not ask the session for
   * itself, because the reason has to be rendered once for the section and the
   * switch has to point at that element. Two sources for one fact would be two
   * things to keep in step.
   */
  readonly describedBy?: string | null
}

/**
 * One relay, as a switch.
 *
 * Each row owns its own mutation. That is what gives every switch an independent
 * pending state: one shared mutation would report `isPending` for all of them, so
 * flipping the porch light would grey out the gate light too.
 */
export function RelayRow({ relay, describedBy = null }: RelayRowProps) {
  const setRelay = useSetRelay()
  const queryClient = useQueryClient()
  const noteId = useId()
  const readOnly = describedBy !== null

  // The hub accepted the write and then answered unreadably, so what the switch
  // shows is this app's guess rather than something the hub reported. True until
  // the hub speaks again, and then false — derived from two timestamps the client
  // already keeps rather than from a flag somebody has to remember to clear. The
  // app holds no state of its own, and this is not the place to start.
  //
  // `<=` rather than `<`. Both timestamps are milliseconds, so equal means "too
  // close to order", and of the two ways to guess wrong only one of them tells
  // somebody a mains circuit is where they left it when nothing confirmed that.
  const unconfirmed =
    setRelay.isError &&
    setRelay.error.kind === 'unreadable' &&
    (queryClient.getQueryState(relayKeys.all)?.dataUpdatedAt ?? 0) <= setRelay.submittedAt

  return (
    <li className={styles.row}>
      <button
        type="button"
        // `role="switch"` with `aria-checked` is what makes this announce as a
        // switch that is on or off. The visible On/Off text says the same thing
        // for everyone else and is hidden from assistive technology, so the state
        // is not read out twice.
        role="switch"
        // Still true or false while unconfirmed. ARIA allows `mixed` on a
        // checkbox but not on a switch, so the doubt is attached as a description
        // rather than faked in the state — a switch that announced nothing at all
        // would be worse than one that announces a value with a caveat.
        aria-checked={relay.on}
        aria-busy={setRelay.isPending}
        // `aria-disabled`, not `disabled`. A disabled element is not focusable, so
        // a browser blurs it the moment the attribute lands — which is the whole
        // of the bug: pressing a switch with the keyboard threw you back to the
        // top of the document, on every press, and the write is over in
        // milliseconds so there is nothing to see happen. `aria-disabled` says the
        // same thing to assistive technology and leaves the element focusable.
        //
        // The press has to be refused in the handler instead, because
        // `aria-disabled` is a claim about the control and not a rule the browser
        // enforces.
        // `aria-disabled` for the role too, and for the same reason as for a write
        // in flight: a `disabled` control is not focusable, so a viewer could not
        // reach it to find out why it is unavailable. Unreachable and unexplained
        // is the one combination worth avoiding — see the panel's note.
        aria-disabled={setRelay.isPending || readOnly}
        // Both, when there are both: the doubt about this switch and the reason
        // the section cannot be used are different things to say, and a reader
        // arriving here needs whichever apply.
        {...(unconfirmed || readOnly
          ? {
              'aria-describedby': [unconfirmed ? noteId : null, describedBy]
                .filter((id) => id !== null)
                .join(' '),
            }
          : {})}
        className={styles.control}
        onClick={() => {
          // `aria-disabled` is a claim about the control, not a rule the browser
          // enforces, so both refusals happen here. The hub would refuse the
          // write anyway; not sending it spares the reader a round trip and the
          // hub's failure limiter a count against this browser.
          if (setRelay.isPending || readOnly) {
            return
          }
          // The desired state, not a toggle: see setRelay in the API layer.
          setRelay.mutate({ id: relay.id, on: !relay.on })
        }}
      >
        <span className={styles.label}>{relay.label}</span>
        <span
          className={
            unconfirmed ? styles.stateUnconfirmed : relay.on ? styles.stateOn : styles.stateOff
          }
          aria-hidden="true"
        >
          <span className={styles.dot} />
          {unconfirmed ? (relay.on ? 'On?' : 'Off?') : relay.on ? 'On' : 'Off'}
        </span>
      </button>

      {/*
        What happened, for somebody who cannot see the switch move.

        One live region per row, not two. Only failure used to be announced, so the
        one outcome that went by in silence was a mains circuit actually changing
        state — the case where a confirmation is most worth having. Adding a second
        region for that would have meant two of them competing to describe the same
        press, so this is the only one, and it carries whichever outcome there is.

        `role="status"` rather than `alert`: an alert interrupts, and neither a
        switch doing what it was asked nor a lost confirmation is an interruption.
        A refusal is, and that is still an alert below.

        Rendered empty rather than added when there is something to say. A live
        region the browser has not been watching may not be announced at all when
        it appears, so it has to be in the document from the start.

        Hidden visually rather than hidden from assistive technology — the switch
        already says On or Off to anyone who can see it, and the note below already
        says the rest.
      */}
      <span className={styles.announcement} role="status">
        {unconfirmed
          ? `${relay.label}: ${setRelay.error.message} Rechecking with the hub.`
          : setRelay.isSuccess
            ? `${relay.label} ${relay.on ? 'on' : 'off'}`
            : ''}
      </span>

      {unconfirmed ? (
        // Visible, and not a live region of its own — the switch points at it with
        // aria-describedby and the region above announces it. The write was
        // applied; only the confirmation was lost, and calling that an error would
        // send somebody to fix a circuit that is already where they asked for it.
        <p className={styles.unconfirmed} id={noteId}>
          {setRelay.error.message} The switch may have moved — rechecking with the hub.
        </p>
      ) : (
        setRelay.isError && (
          <p className={styles.error} role="alert">
            {setRelay.error.message}
          </p>
        )
      )}
    </li>
  )
}
