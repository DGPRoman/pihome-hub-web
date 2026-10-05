import { describe, expect, it } from 'vitest'

import { encodeQr, modulesToPath } from './qr'

describe('modulesToPath', () => {
  it('draws a run of dark modules as one rectangle', () => {
    expect(modulesToPath([[false, true, true, true, false]])).toBe('M1 0h3v1h-3z')
  })

  it('starts a new rectangle at every gap and every row', () => {
    expect(
      modulesToPath([
        [true, false, true],
        [false, true, false],
      ]),
    ).toBe('M0 0h1v1h-1zM2 0h1v1h-1zM1 1h1v1h-1z')
  })

  it('draws nothing for a light row', () => {
    expect(modulesToPath([[false, false]])).toBe('')
  })
})

describe('encodeQr', () => {
  const LINK = 'http://hub.local:5002/join#' + 'A'.repeat(43)

  it('leaves the four modules of quiet zone the standard asks for', () => {
    const { size, path } = encodeQr(LINK)

    // Nothing dark in the outer four rows or columns.
    const coordinates = [...path.matchAll(/M(\d+) (\d+)h(\d+)/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      run: Number(match[3]),
    }))
    expect(coordinates.length).toBeGreaterThan(0)
    for (const { x, y, run } of coordinates) {
      expect(x).toBeGreaterThanOrEqual(4)
      expect(y).toBeGreaterThanOrEqual(4)
      expect(x + run).toBeLessThanOrEqual(size - 4)
      expect(y).toBeLessThan(size - 4)
    }
  })

  it('is small enough for a phone to read from across a table', () => {
    // A join link is around eighty characters. At error correction M that is a
    // version 5 or 6 code — 37 to 41 modules a side — plus the quiet zone. A much
    // larger one means something other than the link was encoded.
    expect(encodeQr(LINK).size).toBeLessThanOrEqual(41 + 8)
  })

  it('is the same picture for the same link', () => {
    expect(encodeQr(LINK)).toStrictEqual(encodeQr(LINK))
  })

  it('is a different picture for a different token', () => {
    expect(encodeQr(LINK).path).not.toBe(encodeQr(LINK.replace(/A$/, 'B')).path)
  })
})
