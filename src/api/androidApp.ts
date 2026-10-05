import { HubError } from './errors'
import { hubRequest, isRecord, malformed, onlyHubErrors, readJson } from './http'

const ANDROID_APP_PATH = '/app/android.json'

/** The Android app this hub offers, as a phone can check what it downloads. */
export interface AndroidApp {
  /** SHA-256 of the APK, lower-case hex. */
  readonly sha256: string
  /** Size in bytes. */
  readonly size: number
}

/**
 * Whether this hub offers the Android app, and which file it is.
 *
 * `null` when it offers none: the hub answers 404 until an operator installs one,
 * and that is an ordinary answer, not a failure. Needs no session, so the join
 * page can ask before anybody is logged in.
 *
 * Rejects with a `HubError`, or with the `AbortError` of a cancelled request.
 */
export async function fetchAndroidApp(
  signal: AbortSignal | null = null,
): Promise<AndroidApp | null> {
  return onlyHubErrors(async () => {
    let response: Response
    try {
      response = await hubRequest(ANDROID_APP_PATH, { method: 'GET' }, signal)
    } catch (cause) {
      if (cause instanceof HubError && cause.kind === 'not-found') {
        return null
      }
      throw cause
    }
    return parseAndroidApp(await readJson(response))
  })
}

function parseAndroidApp(value: unknown): AndroidApp {
  if (
    !isRecord(value) ||
    typeof value.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.sha256) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size <= 0
  ) {
    throw malformed('the Android app')
  }
  return { sha256: value.sha256, size: value.size }
}
