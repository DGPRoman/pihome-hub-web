/**
 * Cache keys, in one place.
 *
 * A mutation has to name the same key the query used, or invalidation quietly
 * does nothing and the list stops agreeing with the hub. Keeping them here means
 * that agreement is a shared constant rather than two string literals that
 * happen to match today.
 */
export const relayKeys = {
  all: ['relays'] as const,
}
