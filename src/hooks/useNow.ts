import { useEffect, useState } from 'react'

/**
 * The time, re-read every `periodMs` while the component is mounted.
 *
 * For a countdown, which is the one thing on these pages that changes with no
 * request behind it. Kept out of everything else: a render that reads the clock
 * directly cannot be tested without freezing it, and would not re-render as it
 * moved anyway.
 */
export function useNow(periodMs: number): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, periodMs)
    return () => {
      clearInterval(timer)
    }
  }, [periodMs])

  return now
}
