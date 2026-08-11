import { describe, expect, it } from 'vitest'

import { parseRule, parseRuleCollection } from './automation'
import { HubError } from './errors'

/** Exactly the shape the hub sends. */
const REPORTED = {
  id: 'porch-motion-light',
  when: { device: 'porch-motion', motion: true },
  then: { relay: 'porch-light', state: 'on', hold_seconds: 60 },
  only_after_dark: true,
  enabled: true,
}

describe('parseRule', () => {
  it('maps the wire format onto the app’s own shape', () => {
    expect(parseRule(REPORTED)).toEqual({
      id: 'porch-motion-light',
      enabled: true,
      onlyAfterDark: true,
      when: { device: 'porch-motion', motion: true },
      then: { relay: 'porch-light', state: 'on', holdSeconds: 60 },
    })
  })

  it('reads an absent hold as null, not as zero', () => {
    // Zero would mean "revert immediately"; null means the state is left in place.
    const rule = parseRule({ ...REPORTED, then: { relay: 'gate-light', state: 'off' } })

    expect(rule.then.holdSeconds).toBeNull()
  })

  it('keeps a disabled rule', () => {
    expect(parseRule({ ...REPORTED, enabled: false }).enabled).toBe(false)
  })

  it.each([
    ['a missing id', { ...REPORTED, id: undefined }],
    ['enabled missing', { ...REPORTED, enabled: undefined }],
    ['only_after_dark missing', { ...REPORTED, only_after_dark: undefined }],
    ['a state the hub does not use', { ...REPORTED, then: { relay: 'r', state: 'maybe' } }],
    ['motion as a string', { ...REPORTED, when: { device: 'd', motion: 'true' } }],
    ['a trigger without a device', { ...REPORTED, when: { motion: true } }],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(() => parseRule(body)).toThrow(HubError)
  })
})

describe('parseRuleCollection', () => {
  it('accepts a well-formed collection', () => {
    expect(parseRuleCollection({ rules: [REPORTED] })).toHaveLength(1)
  })

  it('accepts a hub with no rules', () => {
    expect(parseRuleCollection({ rules: [] })).toEqual([])
  })

  it.each([
    ['a bare array', [REPORTED]],
    ['an object without the key', { automation: [] }],
    ['an entry that is not a rule', { rules: [REPORTED, { id: 'x' }] }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseRuleCollection(body)).toThrow(HubError)
  })
})
