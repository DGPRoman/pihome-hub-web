import type { ManagedRole, Role } from '../api/types'

/**
 * Roles in the order of what they may do.
 *
 * Ranked rather than compared by name, mirroring the hub's own `_RANK`: a role
 * added between two of these is one line here and nothing at the call sites. The
 * order is the hub's to decide and this only follows it — which is why the
 * functions below are named after what the hub requires rather than after a role.
 */
const RANK: Readonly<Record<Role, number>> = {
  viewer: 0,
  operator: 1,
  admin: 2,
}

/**
 * Whether this role may switch a circuit.
 *
 * The hub enforces this and would refuse the write anyway. What this decides is
 * only what to render — and rendering it is the point: a control that vanishes
 * for a `viewer` tells them the feature does not exist, while one that is there
 * and says why it is unavailable tells them what to go and ask for.
 *
 * Never consulted to *permit* anything. Nothing here grants access; the most a
 * wrong answer can do is offer a control the hub then refuses, which is the
 * direction that fails safely — see `useMayChangeTheHouse`.
 */
export function mayChangeTheHouse(role: Role): boolean {
  return RANK[role] >= RANK.operator
}

/**
 * Why a control is unavailable, in words for the person reading it.
 *
 * One string, used by every control that has to say it, so that two of them
 * cannot come to word the same refusal differently.
 */
export const CANNOT_CHANGE_THE_HOUSE =
  'Your account may read the house but not change it. An admin can raise it to operator.'

/**
 * Whether this role may see and manage the people who use the hub.
 *
 * Unlike switching a circuit, not something to show and explain to anybody else.
 * Nobody is raised to `admin` from here — it is granted on the hub's console — so
 * there is no request a `viewer` could make of an admin that would change what this
 * says, and a section explaining that to them would be noise.
 */
export function mayManagePeople(role: Role): boolean {
  return RANK[role] >= RANK.admin
}

/**
 * Whether an account with this role can be changed from here.
 *
 * Every account but an admin's. The hub refuses the rest, and this decides only
 * that the controls are not offered for them.
 */
export function isManagedRole(role: Role): role is ManagedRole {
  return role !== 'admin'
}

/** The roles an admin can hand out from here, least first, as a form lists them. */
export const MANAGED_ROLES: readonly ManagedRole[] = ['viewer', 'operator']

/** Why an admin account has no controls, said once and the same way everywhere. */
export const MANAGED_ON_THE_CONSOLE = "Admin accounts are managed on the hub's console."
