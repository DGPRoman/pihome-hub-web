import { HubError } from './errors'
import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'
import type { Session } from './types'

const SESSION_PATH = '/v1/session'

/**
 * Who this browser is logged in as, or `null`.
 *
 * `null` rather than a rejection for "not logged in". Being logged out is the
 * ordinary state of a page somebody has just opened, not a failure of it, and a
 * query that rejects there would put the whole shell into an error state on the
 * one path that is supposed to end at a login form.
 *
 * Every other failure still rejects: a hub that is not answering is not the same
 * as a hub saying nobody is here, and showing a login form to someone whose
 * network is down would be a lie they cannot act on.
 */
export async function fetchSession(signal: AbortSignal | null = null): Promise<Session | null> {
  return onlyHubErrors(async () => {
    try {
      const response = await hubRequest(SESSION_PATH, { method: 'GET' }, signal)
      return parseSession(await readJson(response))
    } catch (cause) {
      if (cause instanceof HubError && cause.kind === 'unauthorized') {
        return null
      }
      throw cause
    }
  })
}

/**
 * Open a session.
 *
 * The token never reaches this code: the hub returns it in an `HttpOnly` cookie
 * and in no response body, so a scripting bug here cannot read a credential that
 * outlives the page. What comes back is who you now are.
 */
export async function logIn(
  username: string,
  password: string,
  signal: AbortSignal | null = null,
): Promise<Session> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(
      SESSION_PATH,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      },
      signal,
    )
    return parseSession(await readJson(response))
  })
}

/**
 * End the session this browser holds.
 *
 * Idempotent on the hub's side, and treated as such here: logging out of a
 * session that has already expired is not a failure worth reporting to somebody
 * who asked to be logged out.
 */
export async function logOut(signal: AbortSignal | null = null): Promise<void> {
  return onlyHubErrors(async () => {
    try {
      await hubRequest(SESSION_PATH, { method: 'DELETE' }, signal)
    } catch (cause) {
      if (cause instanceof HubError && cause.kind === 'unauthorized') {
        return
      }
      throw cause
    }
  })
}

/**
 * Validate a session body.
 *
 * Builds its own object, like every other parser here, so a field the client was
 * not promised cannot ride along into the cache.
 */
export function parseSession(body: unknown): Session {
  if (
    !isRecord(body) ||
    typeof body.username !== 'string' ||
    typeof body.role !== 'string' ||
    typeof body.expires_at !== 'string'
  ) {
    throw malformed('session data')
  }

  if (body.role !== 'admin' && body.role !== 'operator' && body.role !== 'viewer') {
    // A role this client does not know is not a role it can decide anything
    // from, and guessing would mean guessing in the permissive direction.
    throw malformed('session data')
  }

  const expiresAt = new Date(body.expires_at)
  if (Number.isNaN(expiresAt.getTime())) {
    throw malformed('session data')
  }

  return { username: body.username, role: body.role, expiresAt }
}
