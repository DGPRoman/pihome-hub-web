/**
 * Handing an invitation from this page to the pihome Android app.
 *
 * Somebody scans an invitation's QR code with the phone's camera, and the camera
 * opens this page. On Android the page can pass the invitation on to the app, as a
 * `pihome://join?hub=…&token=…` link the app is registered for, or offer the app
 * when it is not installed. An `https` link could open the app straight from the
 * camera, but only for a domain Android can verify, and a hub at home has none.
 */

/** The app's package name, which Android uses to find it. */
export const ANDROID_PACKAGE = 'io.github.dgproman.pihome'

/** Where this hub serves the APK, when it has one. */
export const APK_PATH = '/app/pihome.apk'

/** Whether this browser runs on Android, where the app can be offered at all. */
export function isAndroid(userAgent: string): boolean {
  return /\bAndroid\b/.test(userAgent)
}

/**
 * The link that opens the invitation in the app.
 *
 * An `intent:` link rather than a bare `pihome://` one, because it names the app's
 * package and says where to go when the app is not there: `fallback`, which is the
 * APK when this hub offers one. Without a fallback, Chrome would send the person to
 * a store the app is not in.
 *
 * The token travels inside the link, from this page to the app through Android,
 * and never over the network.
 */
export function appLink(origin: string, token: string, fallback: string): string {
  const query = `hub=${encodeURIComponent(origin)}&token=${encodeURIComponent(token)}`
  const extras = [
    'scheme=pihome',
    `package=${ANDROID_PACKAGE}`,
    `S.browser_fallback_url=${encodeURIComponent(fallback)}`,
  ]
  return `intent://join?${query}#Intent;${extras.join(';')};end`
}

/** A size in bytes, as somebody about to download it wants to read it. */
export function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
