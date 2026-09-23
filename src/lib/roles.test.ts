import { describe, expect, it } from 'vitest'

import type { Role } from '../api/types'

import { CANNOT_CHANGE_THE_HOUSE, mayChangeTheHouse } from './roles'

describe('mayChangeTheHouse', () => {
  /**
   * Every role, and whether it may switch a circuit.
   *
   * A total Record rather than a list, so the compiler requires a row per role.
   * A role added to the union without a decision here would otherwise inherit
   * whichever answer the ranking happened to give it.
   */
  const EXPECTED: Readonly<Record<Role, boolean>> = {
    viewer: false,
    operator: true,
    admin: true,
  }

  it.each(Object.entries(EXPECTED))('a %s may change the house: %s', (role, expected) => {
    expect(mayChangeTheHouse(role as Role)).toBe(expected)
  })

  it('mirrors the hub rather than deciding for itself', () => {
    // The hub ranks viewer below operator below admin and refuses a write below
    // operator. If that order ever changes there, this is the line that has to
    // change here — and a role above operator must never lose what one below it
    // has.
    expect(mayChangeTheHouse('admin')).toBe(true)
    expect(mayChangeTheHouse('operator')).toBe(true)
    expect(mayChangeTheHouse('viewer')).toBe(false)
  })
})

describe('the reason a control is unavailable', () => {
  it('says what to do about it rather than only what is wrong', () => {
    // Somebody reading this can act on it: it names the role they would need and
    // who can give it to them. "Permission denied" names neither.
    expect(CANNOT_CHANGE_THE_HOUSE).toMatch(/admin/)
    expect(CANNOT_CHANGE_THE_HOUSE).toMatch(/operator/)
  })

  it('does not blame the reader or the app', () => {
    expect(CANNOT_CHANGE_THE_HOUSE).not.toMatch(/error|failed|denied/i)
  })
})
