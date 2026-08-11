import { useQuery } from '@tanstack/react-query'

import { fetchRules } from '../api/automation'
import { ruleKeys } from './queryKeys'

/** Read the hub's automation rules. They change only when its config file does. */
export function useRules() {
  return useQuery({
    queryKey: ruleKeys.all,
    queryFn: ({ signal }) => fetchRules(signal),
    // Rules come from a file the hub reads at startup, so polling them on the
    // relay interval would be noise.
    refetchInterval: false,
  })
}
