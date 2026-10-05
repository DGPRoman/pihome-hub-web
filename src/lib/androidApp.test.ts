import { describe, expect, it } from 'vitest'

import { appLink, isAndroid, megabytes } from './androidApp'

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const CHROME_DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'

describe('isAndroid', () => {
  it('is true on an Android phone and nowhere else', () => {
    expect(isAndroid(CHROME_ANDROID)).toBe(true)
    expect(isAndroid(CHROME_DESKTOP)).toBe(false)
    expect(isAndroid(SAFARI_IPHONE)).toBe(false)
  })
})

describe('appLink', () => {
  it('opens the app by package, with the hub and the token, falling back where it is told', () => {
    expect(
      appLink('http://192.168.1.20:5002', 'Ab3_-xYz', 'http://192.168.1.20:5002/app/pihome.apk'),
    ).toBe(
      'intent://join?hub=http%3A%2F%2F192.168.1.20%3A5002&token=Ab3_-xYz' +
        '#Intent;scheme=pihome;package=io.github.dgproman.pihome;' +
        'S.browser_fallback_url=http%3A%2F%2F192.168.1.20%3A5002%2Fapp%2Fpihome.apk;end',
    )
  })

  it('encodes anything that would end the link early', () => {
    const link = appLink('http://[fd00::20]:5002', 'a#b;c&d', 'http://x/join#a#b;c&d')

    expect(link).toContain('hub=http%3A%2F%2F%5Bfd00%3A%3A20%5D%3A5002&token=a%23b%3Bc%26d#Intent;')
    expect(link.match(/#/g)).toHaveLength(1)
    expect(link.endsWith(';end')).toBe(true)
  })
})

describe('megabytes', () => {
  it('rounds to a tenth', () => {
    expect(megabytes(29_540_817)).toBe('29.5 MB')
  })
})
