import { useId, useState } from 'react'

import { useLogIn } from '../hooks/useSession'

import styles from './LoginForm.module.css'

/**
 * The way in.
 *
 * The two fields are local component state rather than cache state, which is the
 * one place in this app that is right: a half-typed password is not something the
 * hub said, it is not shared with anything, and it should not survive the form
 * being closed.
 */
export function LoginForm() {
  const logIn = useLogIn()
  const usernameId = useId()
  const passwordId = useId()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        logIn.mutate({ username, password })
      }}
    >
      <h2 className={styles.heading}>Log in</h2>

      <label className={styles.field} htmlFor={usernameId}>
        <span>Username</span>
        <input
          id={usernameId}
          name="username"
          // Tells a password manager which account this is, and lets a browser
          // offer the right one.
          autoComplete="username"
          required
          value={username}
          disabled={logIn.isPending}
          onChange={(event) => {
            setUsername(event.target.value)
          }}
        />
      </label>

      <label className={styles.field} htmlFor={passwordId}>
        <span>Password</span>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          disabled={logIn.isPending}
          onChange={(event) => {
            setPassword(event.target.value)
          }}
        />
      </label>

      <button type="submit" disabled={logIn.isPending} aria-busy={logIn.isPending}>
        {logIn.isPending ? 'Logging in…' : 'Log in'}
      </button>

      {logIn.isError && (
        // The hub answers every wrong credential the same way on purpose — no
        // such account, wrong password and disabled account are not
        // distinguished — so this shows what it said and adds nothing.
        <p className={styles.error} role="alert">
          {logIn.error.message}
        </p>
      )}
    </form>
  )
}
