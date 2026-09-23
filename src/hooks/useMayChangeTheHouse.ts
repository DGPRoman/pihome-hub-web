import { mayChangeTheHouse } from '../lib/roles'

import { useSession } from './useSession'

/**
 * Whether the account this browser is logged in as may switch a circuit.
 *
 * `false` while the session is unknown, which is the safe direction and not a
 * cautious one: the shell renders no panel until the session has resolved, so
 * this is only reached with a session in hand. The fallback covers the case
 * where that stops being true, and offering a control the hub then refuses is
 * the failure worth avoiding.
 *
 * Reads the same query the shell already made rather than asking again. React
 * Query serves it from the cache, so a component that needs the role costs
 * nothing to add one to.
 */
export function useMayChangeTheHouse(): boolean {
  const session = useSession()
  const current = session.data
  return current !== null && current !== undefined && mayChangeTheHouse(current.role)
}
