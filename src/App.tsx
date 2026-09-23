import styles from './App.module.css'
import { DevicePanel } from './components/DevicePanel'
import { LoginForm } from './components/LoginForm'
import { RelayPanel } from './components/RelayPanel'
import { RulePanel } from './components/RulePanel'
import { SensorPanel } from './components/SensorPanel'
import { SessionBar } from './components/SessionBar'
import { useSession } from './hooks/useSession'

/**
 * Application shell. Sections own their own data; this decides whether there is
 * anybody to show it to.
 *
 * Three states, not two. "Still asking" is separate from "nobody is logged in"
 * because rendering a login form during the first probe would flash one at
 * somebody who is already logged in, on every page load.
 */
export function App() {
  const session = useSession()

  return (
    <main className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.title}>pihome-hub</h1>
        {session.data !== null && session.data !== undefined && (
          <SessionBar session={session.data} />
        )}
      </header>

      {session.isPending ? (
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
        </>
      )}
    </main>
  )
}
