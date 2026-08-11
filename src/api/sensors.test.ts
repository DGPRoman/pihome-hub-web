import { afterEach, describe, expect, it, vi } from 'vitest'

import { HubError } from './errors'
import { fetchSensors, parseSensor, parseSensorCollection } from './sensors'

/** Exactly the shape the hub sends, snake_case and ISO strings included. */
const REPORTED = {
  id: 'porch-motion',
  label: 'Porch motion sensor',
  stale: false,
  last_seen: '2026-08-11T07:27:37.220550Z',
  motion: true,
  motion_updated_at: '2026-08-11T07:27:37.220550Z',
  temperature: 18.5,
  humidity: 62,
  climate_updated_at: '2026-08-11T07:27:37.220550Z',
}

/** A configured device that has never pushed anything. */
const SILENT = {
  id: 'gate-camera',
  label: 'Gate camera motion',
  stale: true,
  last_seen: null,
  motion: null,
  motion_updated_at: null,
  temperature: null,
  humidity: null,
  climate_updated_at: null,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSensor', () => {
  it('maps the wire format onto the app’s own shape', () => {
    expect(parseSensor(REPORTED)).toEqual({
      id: 'porch-motion',
      label: 'Porch motion sensor',
      stale: false,
      lastSeen: new Date('2026-08-11T07:27:37.220550Z'),
      motion: true,
      temperature: 18.5,
      humidity: 62,
    })
  })

  it('turns the timestamp into a Date, not a string that has to be remembered', () => {
    expect(parseSensor(REPORTED).lastSeen).toBeInstanceOf(Date)
  })

  it('drops the fields the app does not model, rather than passing them through', () => {
    const parsed = parseSensor(REPORTED)

    expect(parsed).not.toHaveProperty('last_seen')
    expect(parsed).not.toHaveProperty('motion_updated_at')
    expect(parsed).not.toHaveProperty('climate_updated_at')
  })

  it('reads a device that never reported as null readings, not as zeroes', () => {
    // A sensor that has never spoken must not look like a cold, still room.
    expect(parseSensor(SILENT)).toEqual({
      id: 'gate-camera',
      label: 'Gate camera motion',
      stale: true,
      lastSeen: null,
      motion: null,
      temperature: null,
      humidity: null,
    })
  })

  it('accepts a reading carrying only some quantities', () => {
    const parsed = parseSensor({ ...SILENT, last_seen: REPORTED.last_seen, motion: false })

    expect(parsed.motion).toBe(false)
    expect(parsed.temperature).toBeNull()
  })

  it.each([
    ['a missing id', { ...REPORTED, id: undefined }],
    ['stale missing', { ...REPORTED, stale: undefined }],
    ['stale as a string', { ...REPORTED, stale: 'false' }],
    ['motion as a string', { ...REPORTED, motion: 'true' }],
    ['temperature as a string', { ...REPORTED, temperature: '18.5' }],
    ['an unparseable timestamp', { ...REPORTED, last_seen: 'yesterday' }],
    ['a timestamp that is not a string', { ...REPORTED, last_seen: 1_754_890_057 }],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(() => parseSensor(body)).toThrow(HubError)
  })

  it('rejects a non-finite temperature rather than rendering Infinity', () => {
    // JSON has no Infinity literal, but 1e999 parses to it.
    const body = JSON.parse(
      `{"id":"a","label":"A","stale":false,"last_seen":null,"temperature":1e999}`,
    ) as unknown

    expect(() => parseSensor(body)).toThrow(HubError)
  })
})

describe('parseSensorCollection', () => {
  it('accepts a well-formed collection', () => {
    expect(parseSensorCollection({ sensors: [REPORTED, SILENT] })).toHaveLength(2)
  })

  it('accepts an empty collection, which is a hub with no sensors configured', () => {
    expect(parseSensorCollection({ sensors: [] })).toEqual([])
  })

  it.each([
    ['a bare array', [REPORTED]],
    ['null', null],
    ['an object without the key', { devices: [] }],
    ['sensors that are not an array', { sensors: REPORTED }],
    ['an entry that is not a sensor', { sensors: [REPORTED, { id: 'x' }] }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseSensorCollection(body)).toThrow(HubError)
  })
})

describe('fetchSensors', () => {
  it('reads the sensors the hub reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ sensors: [REPORTED] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const sensors = await fetchSensors()

    expect(sensors).toHaveLength(1)
    expect(sensors[0]?.label).toBe('Porch motion sensor')
  })

  it('reports a rejected key rather than an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'nope' }), { status: 401 })),
    )

    await expect(fetchSensors()).rejects.toMatchObject({ kind: 'unauthorized' })
  })
})
