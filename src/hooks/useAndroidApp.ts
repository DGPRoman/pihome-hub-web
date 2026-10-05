import { useQuery } from '@tanstack/react-query'

import { fetchAndroidApp } from '../api/androidApp'
import { androidAppKeys } from './queryKeys'

/**
 * Whether this hub offers the Android app. Asked once per page: which APK the hub
 * holds changes when an operator installs another, not while somebody is joining.
 */
export function useAndroidApp() {
  return useQuery({
    queryKey: androidAppKeys.current,
    queryFn: ({ signal }) => fetchAndroidApp(signal),
    staleTime: Infinity,
    refetchInterval: false,
  })
}
