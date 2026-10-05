import { HubError } from './errors'
import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'
import type { Account, Invitation, ManagedRole, Role } from './types'

/**
 * Accounts and their invitations.
 *
 * Every route here takes an admin session and nothing else — never a key. The relay
 * key opens every relay route and none of these, which is why a `401` from one of
 * them always means the session ended.
 */
const USERS_PATH = '/v1/users'

function accountPath(username: string): string {
  return `${USERS_PATH}/${encodeURIComponent(username)}`
}

/** Every account on the hub, in the order the hub lists them. */
export async function fetchAccounts(
  signal: AbortSignal | null = null,
): Promise<readonly Account[]> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(USERS_PATH, { method: 'GET' }, signal)
    return parseAccountCollection(await readJson(response))
  })
}

/**
 * Make an account with no password, for somebody to join by invitation.
 *
 * The two refusals worth putting in words are both about the name, and both are
 * things the person filling in the form can fix.
 */
export async function createAccount(
  username: string,
  role: ManagedRole,
  signal: AbortSignal | null = null,
): Promise<Account> {
  return onlyHubErrors(async () => {
    try {
      const response = await hubRequest(
        USERS_PATH,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, role }),
        },
        signal,
      )
      return parseAccount(await readJson(response))
    } catch (cause) {
      if (cause instanceof HubError && cause.kind === 'conflict') {
        throw new HubError(
          'conflict',
          // Ignoring case, as the hub compares them: "Olya" is taken by "olya".
          'There is already an account by that name. Names are compared ignoring case.',
          cause.status,
        )
      }
      if (cause instanceof HubError && cause.kind === 'malformed') {
        // The form checks the name before sending, so a refusal here is the hub's
        // rule and this client's copy of it disagreeing. Saying which field is the
        // most this can do; the hub's own reason is in its log.
        throw new HubError('malformed', 'The hub did not accept that name.', cause.status)
      }
      throw cause
    }
  })
}

/** What may change about an account from here. Absent means unchanged. */
export interface AccountChange {
  readonly role?: ManagedRole
  readonly disabled?: boolean
}

/** Move an account between `operator` and `viewer`, or disable it, or let it back in. */
export async function changeAccount(
  username: string,
  change: AccountChange,
  signal: AbortSignal | null = null,
): Promise<Account> {
  return onlyHubErrors(async () => {
    const response = await hubRequest(
      accountPath(username),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      },
      signal,
    )
    return parseAccount(await readJson(response))
  })
}

/** Delete an account. Its sessions end with it, and so does any invitation. */
export async function deleteAccount(
  username: string,
  signal: AbortSignal | null = null,
): Promise<void> {
  return onlyHubErrors(async () => {
    await hubRequest(accountPath(username), { method: 'DELETE' }, signal)
  })
}

/**
 * Issue a one-time token for an account, replacing any it had.
 *
 * Works for an account with a password too — a new phone for somebody who has
 * always typed one — so nothing here asks which kind it is.
 */
export async function issueInvitation(
  username: string,
  signal: AbortSignal | null = null,
): Promise<Invitation> {
  return onlyHubErrors(async () => {
    try {
      const response = await hubRequest(
        `${accountPath(username)}/invitation`,
        { method: 'POST' },
        signal,
      )
      return parseInvitation(await readJson(response))
    } catch (cause) {
      if (cause instanceof HubError && cause.kind === 'conflict') {
        throw new HubError(
          'conflict',
          'This account is disabled. Enable it before inviting anybody to it.',
          cause.status,
        )
      }
      throw cause
    }
  })
}

/** Withdraw an account's invitation. Idempotent: there being none is not a failure. */
export async function revokeInvitation(
  username: string,
  signal: AbortSignal | null = null,
): Promise<void> {
  return onlyHubErrors(async () => {
    await hubRequest(`${accountPath(username)}/invitation`, { method: 'DELETE' }, signal)
  })
}

const ROLES: ReadonlySet<string> = new Set<Role>(['admin', 'operator', 'viewer'])

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.has(value)
}

/** A date the hub sent, or `undefined` when what it sent is not one. */
function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Validate one account.
 *
 * An unknown role is refused rather than shown, as the session's is: the panel
 * decides from it which controls an account gets, and a guess would be a guess
 * about whether it may be changed from here.
 */
export function parseAccount(body: unknown): Account {
  if (
    !isRecord(body) ||
    typeof body.username !== 'string' ||
    !isRole(body.role) ||
    typeof body.disabled !== 'boolean'
  ) {
    throw malformed('account data')
  }

  const createdAt = parseDate(body.created_at)
  if (createdAt === undefined) {
    throw malformed('account data')
  }

  let invitationExpiresAt: Date | null = null
  if (body.invitation_expires_at !== null) {
    const parsed = parseDate(body.invitation_expires_at)
    if (parsed === undefined) {
      throw malformed('account data')
    }
    invitationExpiresAt = parsed
  }

  return {
    username: body.username,
    role: body.role,
    disabled: body.disabled,
    createdAt,
    invitationExpiresAt,
  }
}

export function parseAccountCollection(body: unknown): readonly Account[] {
  if (!isRecord(body) || !Array.isArray(body.users)) {
    throw malformed('the account list')
  }
  return body.users.map((account: unknown) => parseAccount(account))
}

/** Validate an invitation. An empty token would make a link that opens nothing. */
export function parseInvitation(body: unknown): Invitation {
  if (!isRecord(body) || typeof body.token !== 'string' || body.token === '') {
    throw malformed('the invitation')
  }
  const expiresAt = parseDate(body.expires_at)
  if (expiresAt === undefined) {
    throw malformed('the invitation')
  }
  return { token: body.token, expiresAt }
}
