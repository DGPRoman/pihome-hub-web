import { useId, useState } from 'react'

import type { ManagedRole } from '../api/types'
import { useCreateAccount } from '../hooks/useAccounts'
import { MANAGED_ROLES } from '../lib/roles'
import { isUsername, USERNAME_RULE } from '../lib/usernames'
import buttons from '../styles/button.module.css'

import styles from './AddPersonForm.module.css'

/** What each role means, for somebody choosing one for another person. */
const WHAT_IT_MAY_DO: Readonly<Record<ManagedRole, string>> = {
  viewer: 'sees the house and changes nothing',
  operator: 'also switches the lights and relays',
}

interface AddPersonFormProps {
  /** Called with the account the hub made, so it can be invited at once. */
  readonly onCreated: (username: string) => void
}

/**
 * Add somebody: a name and a role, and then straight to their invitation.
 *
 * No password field. The account is made with none anybody holds, and the
 * invitation is the way in — which is the whole of why adding a person no longer
 * needs somebody at the hub's console.
 */
export function AddPersonForm({ onCreated }: AddPersonFormProps) {
  const create = useCreateAccount()
  const headingId = useId()
  const nameId = useId()
  const ruleId = useId()
  const [username, setUsername] = useState('')
  // The least an account can be. Making somebody an operator is a choice to make
  // on purpose, not a default to forget to change.
  const [role, setRole] = useState<ManagedRole>('viewer')
  const [submitted, setSubmitted] = useState(false)

  const valid = isUsername(username)
  // Not flagged while it is being typed: every name is invalid one letter in.
  const flagged = submitted && !valid

  return (
    <form
      className={styles.form}
      aria-labelledby={headingId}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (!valid || create.isPending) {
          return
        }
        create.mutate(
          { username, role },
          {
            onSuccess: (account) => {
              setUsername('')
              setSubmitted(false)
              onCreated(account.username)
            },
          },
        )
      }}
    >
      <h3 id={headingId} className={styles.heading}>
        Add a person
      </h3>

      <label className={styles.field} htmlFor={nameId}>
        <span>Name</span>
        <input
          id={nameId}
          name="username"
          value={username}
          // Not a login: nothing for a password manager to fill in, and a phone
          // that capitalises the first letter has changed the name.
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={ruleId}
          aria-invalid={flagged}
          onChange={(event) => {
            setUsername(event.target.value)
          }}
        />
      </label>
      <p id={ruleId} className={flagged ? styles.ruleBroken : styles.rule}>
        {USERNAME_RULE}
      </p>

      <fieldset className={styles.roles}>
        <legend>Role</legend>
        {MANAGED_ROLES.map((option) => (
          <label key={option} className={styles.role}>
            <input
              type="radio"
              name="role"
              value={option}
              checked={role === option}
              onChange={() => {
                setRole(option)
              }}
            />
            <span>
              <strong>{option}</strong> — {WHAT_IT_MAY_DO[option]}
            </span>
          </label>
        ))}
      </fieldset>

      <button
        type="submit"
        className={`${buttons.button} ${buttons.primary}`}
        aria-disabled={create.isPending}
        aria-busy={create.isPending}
      >
        {create.isPending ? 'Adding…' : 'Add and invite'}
      </button>

      {create.isError && (
        <p className={styles.error} role="alert">
          {create.error.message}
        </p>
      )}
    </form>
  )
}
