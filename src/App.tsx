import { useState } from 'react'

import styles from './App.module.css'
import { DevicePanel } from './components/DevicePanel'
import { JoinPage } from './components/JoinPage'
import { LoginForm } from './components/LoginForm'
import { PeoplePanel } from './components/PeoplePanel'
import { RelayPanel } from './components/RelayPanel'
import { RulePanel } from './components/RulePanel'
import { SensorPanel } from './components/SensorPanel'
import { SessionBar } from './components/SessionBar'
import { useSession } from './hooks/useSession'
import type { Landing } from './lib/join'
import { mayManagePeople } from './lib/roles'

const HOUSE: Landing = { page: 'house' }

interface AppProps {
  /**
   * Where this page load landed, read from the address before the first render —
   * see `readLanding`, and why it cannot be read here.
   */
  readonly landing?: Landing
}

/**
 * Application shell. Sections own their own data; this decides whether there is
 * anybody to show it to.
 *
 * Three states, not two. "Still asking" is separate from "nobody is logged in"
 * because rendering a login form during the first probe would flash one at
 * somebody who is already logged in, on every page load.
 *
 * And one page beside them, for a link that carries an invitation. Two places to
 * be is not enough to want a router: this holds which one, and the address is
 * tidied to match when it changes.
 */
export function App({ landing = HOUSE }: AppProps) {
  const session = useSession()
  const [page, setPage] = useState(landing)

  const leaveJoinPage = () => {
    // Replaced rather than pushed: going back should not return to a page whose
    // only purpose was a token that is now spent.
    window.history.replaceState(null, '', '/')
    setPage(HOUSE)
  }

  return (
    <main className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>pihome-hub</h1>
        {session.data !== null && session.data !== undefined && (
          <SessionBar session={session.data} />
        )}
      </header>

      {page.page === 'join' ? (
        // Ahead of the session states, which it does not wait for: the person
        // following a link is usually nobody yet, and the page has to say what
        // the button does whoever they are.
        <JoinPage token={page.token} onDone={leaveJoinPage} />
      ) : session.isPending ? (
        <p className={styles.waiting} role="status">
          Asking the hub who you are…
        </p>
      ) : session.isError ? (
        // Not a login form. The hub did not say nobody is here — it did not
        // answer at all, and showing a way in would be a lie somebody would
        // spend their time on.
        <p className={styles.error} role="alert">
          {session.error.message}
        </p>
      ) : session.data === null ? (
        <LoginForm />
      ) : (
        <>
          <RelayPanel />
          <SensorPanel />
          <DevicePanel />
          <RulePanel />
          {mayManagePeople(session.data.role) && <PeoplePanel />}
        </>
      )}
    </main>
  )
}
