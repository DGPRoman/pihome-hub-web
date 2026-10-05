import { HubError } from './errors'
import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'
import type { Session } from './types'

const SESSION_PATH = '/v1/session'

/**
 * What a refused login says.
 *
 * Not the shared message for a 401, which is written for every other route — where
 * it means the credential this browser already held stopped working. Here nothing
 * was held yet: the hub was offered a username and a password and did not take
 * them. It says nothing more specific on purpose, answering no such account, a
 * wrong password and a disabled account alike, so neither does this.
 */
export const LOGIN_REFUSED = 'The hub did not accept that username and password.'

/**
 * What a refused invitation says.
 *
 * One answer for a link that is unknown, used, withdrawn, replaced or out of time,
 * because the hub gives one — and because the person holding it can do the same one
 * thing about every one of them.
 */
export const INVITATION_REFUSED =
  'This invitation does not work any more. Ask whoever sent it for a new one.'

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
    try {
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
    } catch (cause) {
      if (cause instanceof HubError && cause.kind === 'unauthorized') {
        throw new HubError('unauthorized', LOGIN_REFUSED, cause.status)
      }
      throw cause
    }
  })
}

/**
 * Exchange an invitation for a session.
 *
 * Another body for the login route rather than a route of its own, so the hub's set
 * of routes reachable without a credential does not grow. The CSRF header is what
 * `hubRequest` sends on every write anyway, and here the hub insists on it: without
 * it, another page could put this browser into an account of its choosing.
 *
 * Only ever called from a button. Opening the link must not do this — see JoinPage.
 */
export async function joinWithInvitation(
  token: string,
  signal: AbortSignal | null = null,
): Promise<Session> {
  return onlyHubErrors(async () => {
    try {
      const response = await hubRequest(
        SESSION_PATH,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitation: token }),
        },
        signal,
      )
      return parseSession(await readJson(response))
    } catch (cause) {
      // A 422 as well as a 401: the hub reads no token longer than it could have
      // issued, so a 422 is a link that was mangled on the way here — which, to
      // whoever is holding it, is the same as one that ran out.
      if (
        cause instanceof HubError &&
        (cause.kind === 'unauthorized' || cause.kind === 'malformed')
      ) {
        throw new HubError(cause.kind, INVITATION_REFUSED, cause.status)
      }
      throw cause
    }
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
