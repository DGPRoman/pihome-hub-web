import styles from './App.module.css'

/**
 * Application shell.
 *
 * Deliberately empty of behaviour: this commit establishes the build, the type
 * checker and the test runner. Relay state arrives with the API client.
 */
export function App() {
  return (
    <main className={styles.layout}>
      <header>
        <h1 className={styles.title}>pihome-hub</h1>
      </header>

      <section className={styles.panel} aria-labelledby="relays-heading">
        <h2 id="relays-heading" className={styles.panelHeading}>
          Relays
        </h2>
        <p className={styles.panelBody}>Not connected to the hub yet.</p>
      </section>
    </main>
  )
}
