import { useQuery } from '@tanstack/react-query'

import { fetchDevices } from '../api/devices'
import { deviceKeys } from './queryKeys'

/**
 * Read the hub's devices, kept fresh in the background.
 *
 * On the client's shared polling interval rather than one of its own. There would
 * be no point in a faster one: this is a second-hand view, and what it shows is
 * however recently the hub last polled the device — asking the hub more often
 * cannot make the hub have asked the device more often.
 */
export function useDevices() {
  return useQuery({
    queryKey: deviceKeys.all,
    queryFn: ({ signal }) => fetchDevices(signal),
  })
}
