import { useQuery } from '@tanstack/react-query'

import { fetchSensors } from '../api/sensors'
import { sensorKeys } from './queryKeys'

/**
 * Read the hub's sensors, kept fresh in the background.
 *
 * Shares the client's polling interval with the relay read. Sensors change more
 * often than relays — a motion sensor may fire every few seconds — but polling
 * faster would not make the page more truthful, only more talkative: the hub's
 * own automation reacts to readings immediately, without waiting for a browser.
 */
export function useSensors() {
  return useQuery({
    queryKey: sensorKeys.all,
    queryFn: ({ signal }) => fetchSensors(signal),
  })
}
