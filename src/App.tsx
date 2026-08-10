import styles from './App.module.css'
import { RelayPanel } from './components/RelayPanel'

/** Application shell. Sections own their own data. */
export function App() {
  return (
    <main className={styles.layout}>
      <header>
        <h1 className={styles.title}>pihome-hub</h1>
      </header>

      <RelayPanel />
    </main>
  )
}
