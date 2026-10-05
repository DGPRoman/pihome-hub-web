import { describe, expect, it } from 'vitest'

import { isUsername, USERNAME_RULE } from './usernames'

describe('isUsername', () => {
  /**
   * Each verdict here is the hub's own, read from its `check_username` — this is a
   * copy of that rule, and a copy is only worth having while it agrees.
   */
  it.each([
    'olya',
    'ol',
    'Olya',
    'olya.k',
    'olya_k',
    'olya-k',
    'o.l-y_a',
    'olya..k',
    'a1',
    '007',
    'x'.repeat(32),
  ])('accepts %j', (name) => {
    expect(isUsername(name)).toBe(true)
  })

  it.each([
    '',
    'o',
    'x'.repeat(33),
    '.olya',
    'olya.',
    '-olya',
    '_olya',
    'olya_',
    'olya kovalenko',
    'olya@home',
    'olya/k',
    // Another alphabet, and a Latin name with one Cyrillic letter in it. The second
    // is the reason the rule is Latin at all: it looks like "ola" and is not.
    'Оля',
    'olа',
    'olya\n',
  ])('refuses %j', (name) => {
    expect(isUsername(name)).toBe(false)
  })
})

describe('the rule as the form states it', () => {
  it('gives an example, so "Latin letters" is not the only clue', () => {
    expect(USERNAME_RULE).toMatch(/for example \w+/)
  })
})
