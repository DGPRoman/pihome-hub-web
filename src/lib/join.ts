/**
 * The join link: how an invitation travels, and how this page reads one.
 *
 * The token goes after `#`. A browser never sends the fragment to a server, so it
 * reaches no access log, no proxy and no `Referer` — and the hub, which answers
 * `index.html` for any path it has no file for, never learns it was asked.
 */
export const JOIN_PATH = '/join'

/** The house, or the join page with whatever token the address carried. */
export type Landing =
  | { readonly page: 'house' }
  /** `token` is `null` when the address had none — opened twice, or cut short. */
  | { readonly page: 'join'; readonly token: string | null }

/** The link an admin passes on. Built from the address the admin reached the hub by. */
export function invitationLink(origin: string, token: string): string {
  return `${origin}${JOIN_PATH}#${token}`
}

/**
 * Work out where this page load landed, and take the token out of the address.
 *
 * Called once, before the first render, and never from a component: React renders
 * twice in development, and the second read would find the address already tidied
 * and the token gone. What it returns is handed to the app as a value.
 *
 * Removed with `replaceState`, so it leaves the address bar and this tab's history
 * entry and is not on the next screenshot. Losing it costs nothing: the link the
 * person was sent still has it, and works until it is used.
 */
export function readLanding(
  location: Pick<Location, 'pathname' | 'hash'>,
  history: Pick<History, 'replaceState'>,
): Landing {
  if (location.pathname !== JOIN_PATH && location.pathname !== `${JOIN_PATH}/`) {
    return { page: 'house' }
  }

  const token = location.hash.replace(/^#/, '').trim()
  if (location.hash !== '') {
    history.replaceState(null, '', JOIN_PATH)
  }
  return { page: 'join', token: token === '' ? null : token }
}

/**
 * Whether a link built on this host would open this device and no other.
 *
 * An admin on the Pi itself, or on the development server, reaches the hub as
 * `localhost` — and a phone that opens `localhost` opens itself.
 */
export function namesOnlyThisDevice(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    /^127\.\d+\.\d+\.\d+$/.test(hostname)
  )
}
