/**
 * The hub's rule for the name an account logs in with.
 *
 * Mirrored rather than owned. The hub checks every name it is given and its answer
 * is the one that counts; this only lets the form say what is wrong before a round
 * trip does. Loosened on the hub and not here, it would refuse a name the hub would
 * take, so the tests hold it to the hub's own cases.
 *
 * Latin only, and that is the hub's decision rather than an oversight: it compares
 * names ignoring case, and the comparison it uses folds ASCII and nothing else.
 */
const USERNAME = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/

const MIN_LENGTH = 2
const MAX_LENGTH = 32

/** The rule, for a person. Shown under the field, so it is read before it is broken. */
export const USERNAME_RULE =
  'Latin letters and digits, 2 to 32 of them, with ".", "_" or "-" between — for example olya.'

export function isUsername(name: string): boolean {
  return name.length >= MIN_LENGTH && name.length <= MAX_LENGTH && USERNAME.test(name)
}
