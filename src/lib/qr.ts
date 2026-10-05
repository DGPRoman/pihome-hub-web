import { encode } from 'uqr'

/**
 * Modules of quiet zone around the code, which the standard asks for. Fewer and some
 * phone cameras fail to find the code against whatever is drawn beside it.
 */
const QUIET_ZONE = 4

export interface QrMatrix {
  /** Width and height in modules, quiet zone included. */
  readonly size: number
  /** An SVG path with one unit square per dark module. */
  readonly path: string
}

/**
 * Encode `text` as a QR code, ready to draw.
 *
 * Here, in the browser, and nowhere else: the hub only ever hands over the token,
 * and never draws it into an image that something could cache, log or keep.
 *
 * Error correction `M`, which survives a scuffed screen or a glare and still keeps a
 * link of this length to a code a phone reads from across a table.
 */
export function encodeQr(text: string): QrMatrix {
  const { size, data } = encode(text, { ecc: 'M', border: QUIET_ZONE })
  return { size, path: modulesToPath(data) }
}

/**
 * One path for the whole code, a run of dark modules at a time.
 *
 * One element rather than one per module, which would be a few thousand nodes for
 * React to keep track of in a picture that never changes.
 */
export function modulesToPath(modules: readonly (readonly boolean[])[]): string {
  const parts: string[] = []
  modules.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (row[x] !== true) {
        x += 1
        continue
      }
      const start = x
      while (row[x] === true) {
        x += 1
      }
      const run = x - start
      parts.push(`M${start} ${y}h${run}v1h-${run}z`)
    }
  })
  return parts.join('')
}
