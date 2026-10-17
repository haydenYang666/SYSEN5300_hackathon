import { describe, expect, it } from 'vitest'
import { COLUMNS, parseIncidents, parseRows, toCsv } from './csv.js'

const HEADER = COLUMNS.join(',')

describe('parseIncidents', () => {
  it('reads the five columns as text, in any column order, and keeps extra columns unchanged', () => {
    const text = 'zone,incident_id,note,priority,on_scene_at,dispatched_at\r\n' +
      ' A ,X-1, hi ,P1,2026-09-01T09:10:00-04:00,2026-09-01T09:00:00-04:00\r\n'
    expect(parseIncidents(text)).toEqual([{
      incident_id: 'X-1', zone: 'A', priority: 'P1',
      dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '2026-09-01T09:10:00-04:00',
      note: ' hi ',
    }])
  })

  it.each([
    ['short', 'X-1,A,P1,2026-09-01T09:00:00-04:00', 4],
    ['long', 'X-1,A,P1,2026-09-01T09:00:00-04:00,,unlabelled', 6],
  ])('rejects a %s row instead of silently adding or losing cells', (_, row, actual) => {
    expect(() => parseIncidents(`${HEADER}\n${row}\n`))
      .toThrow(`CSV record 2 has ${actual} fields; expected 5.`)
  })

  it.each([
    [`${HEADER},crew,crew`, /Duplicate column name: crew/],
    [`${HEADER}, crew ,crew`, /Duplicate column name: crew/],
    [`${HEADER},zone`, /Duplicate column name: zone/],
    [`${HEADER},`, /Column 6 has no name/],
    [`${HEADER},   `, /Column 6 has no name/],
  ])('rejects ambiguous or unlabelled header %s', (header, message) => {
    expect(() => parseIncidents(`${header}\n`)).toThrow(message)
  })

  it('retains explicit missing cells and blank records for API row-quality checks', () => {
    const rows = parseIncidents(`${HEADER},crew\nX-1,A,P1,2026-09-01T09:00:00-04:00,,\n,,,,,\n`)
    expect(rows[0].on_scene_at).toBe('')
    expect(rows[0].crew).toBe('')
    expect(rows[1]).toEqual(Object.fromEntries([...COLUMNS, 'crew'].map((name) => [name, ''])))
  })

  it('rejects an unclosed note rather than swallowing the following incident', () => {
    const bad = `${HEADER},review_note\nQ1,A,P1,t,t,"unclosed note\nQ2,B,P1,t,t,second incident\n`
    expect(() => parseIncidents(bad)).toThrow(/Unclosed quoted field starting at line 2/)
  })

  it('preserves multiline extras, escaped quotes and leading zero identifiers', () => {
    const records = parseIncidents(`${HEADER},crew,note\r\n00001,A,P1,t,t,007,"first line\r\nsecond, with ""quotes"""\r\n00002,B,P2,t,t,008,plain\r\n`)
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({ incident_id: '00001', crew: '007', note: 'first line\r\nsecond, with "quotes"' })
    expect(parseIncidents(toCsv(records))).toEqual(records)
  })

  it('keeps blank and malformed cells for the server to exclude (no client-side dropping)', () => {
    const rows = parseIncidents(`${HEADER}\nX-1,A,P1,2026-09-01T09:00:00-04:00,\nX-2,A,P1,not a time,2026-09-01T09:10:00-04:00\n`)
    expect(rows).toHaveLength(2)
    expect(rows[0].on_scene_at).toBe('')
    expect(rows[1].dispatched_at).toBe('not a time')
  })

  it('rejects a file missing a required column', () => {
    expect(() => parseIncidents('incident_id,zone,priority,dispatched_at\nX,A,P1,t\n')).toThrow(/on_scene_at/)
  })

  it('rejects an empty file and strips a UTF-8 BOM', () => {
    expect(() => parseIncidents('')).toThrow(/empty/)
    expect(parseIncidents(`﻿${HEADER}\n`)).toEqual([])
  })
})

describe('parseRows / toCsv', () => {
  it.each([
    ['a,b"c,d', /Unexpected quote at line 1, column 4/],
    ['a,"b"c,d', /Unexpected character after closing quote at line 1, column 6/],
    ['a, "b",c', /Unexpected quote at line 1, column 4/],
    ['a,"b" ,c', /Unexpected character after closing quote at line 1, column 6/],
    ['a,"b', /Unclosed quoted field starting at line 1, column 3/],
    ['a,b\r\nc,"d', /Unclosed quoted field starting at line 2, column 3/],
  ])('rejects invalid CSV quoting: %s', (text, message) => {
    expect(() => parseRows(text)).toThrow(message)
  })

  it('retains quoted empty fields and trailing explicit cells without adding a phantom row', () => {
    expect(parseRows('""')).toEqual([['']])
    expect(parseRows('a,b,\r\n')).toEqual([['a', 'b', '']])
    expect(parseRows('\r\n  \r\na,b\r\n\r\n')).toEqual([['a', 'b']])
  })

  it('handles quoted commas, quotes and newlines', () => {
    expect(parseRows('a,"b,c","d ""q""","e\nf"\n')).toEqual([['a', 'b,c', 'd "q"', 'e\nf']])
  })

  it('round-trips records through export and import', () => {
    const recs = [
      { incident_id: 'X,1', zone: 'A "north"', priority: 'P1', dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '' },
      { incident_id: 'X-2', zone: 'B', priority: 'P2', dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '2026-09-01T09:10:01-04:00' },
    ]
    expect(parseIncidents(toCsv(recs))).toEqual(recs)
  })

  it('exports extra columns after the five required ones, blank for records without them', () => {
    const imported = parseIncidents(`station,${HEADER},"crew, lead"\nN1,X-1,A,P1,2026-09-01T09:00:00-04:00,2026-09-01T09:10:00-04:00,"Lee, ""J"""\n`)
    const manual = { incident_id: 'X-2', zone: 'B', priority: 'P1', dispatched_at: '2026-09-01T10:00:00-04:00', on_scene_at: '2026-09-01T10:05:00-04:00' }
    const out = toCsv([...imported, manual])
    expect(out.split('\n')[0]).toBe(`${HEADER},station,"crew, lead"`)
    expect(out.split('\n')[2]).toBe('X-2,B,P1,2026-09-01T10:00:00-04:00,2026-09-01T10:05:00-04:00,,')
    const back = parseIncidents(out)
    expect(back[0]).toEqual(imported[0])
    expect(back[0]['crew, lead']).toBe('Lee, "J"')
  })
})
