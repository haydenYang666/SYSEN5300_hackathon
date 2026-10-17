import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAnalysisSession, parseAnalysisSession } from './analysis-session.js'
import DataSettings from './views/DataSettings.jsx'

const records = [
  { incident_id: '0001', zone: 'A', priority: 'P1', dispatched_at: '2026-09-01T08:00:00-04:00', on_scene_at: '2026-09-01T08:11:00-04:00', note: 'line 1\nline 2, "quoted"' },
  { incident_id: 'excluded', zone: '', priority: 'P1', dispatched_at: 'not a date', on_scene_at: '', note: '' },
]
const settings = { selected_priority: 'P1', target_minutes: '10', baseline_end: '2026-09-21', as_of: '' }
const meta = {
  timezone: 'America/New_York', selected_priority: 'P1', target_minutes: 10,
  baseline_end: '2026-09-21T00:00:00-04:00', as_of: '2026-10-01T04:00:00.123456+00:00',
  reviewed_zones: ['A'], is_mock: false,
}
const result = { res: { meta }, serverClock: true }
const args = {
  records, source: 'example.csv', provenance: { kind: 'synthetic', label: 'Synthetic example' },
  settings, result, selection: { zone: 'A', date: '2026-09-22' }, focus: { zone: 'A', date: '2026-09-22' },
}
const snapshot = () => createAnalysisSession(args)
const parse = (value) => parseAnalysisSession(JSON.stringify(value))

describe('reproducible ordinary analysis snapshots', () => {
  it('round-trips raw valid and excluded records, settings, confirmations and selected day', () => {
    const file = snapshot()
    const restored = parse(file)
    expect(restored.records).toEqual(records)
    expect(restored.source).toBe('example.csv')
    expect(restored.provenance).toEqual({ ...args.provenance, imported: true })
    expect(restored.settings).toEqual({ ...settings, as_of: '2026-10-01T00:00:00' })
    expect(restored.asOf).toBe(meta.as_of)
    expect(restored.reviewedZones).toEqual(['A'])
    expect(restored.selection).toEqual(args.selection)
    expect(restored.focus).toEqual(args.focus)
    expect(file).not.toHaveProperty('result')
    expect(file).not.toHaveProperty('signals')
  })

  it('retains sub-millisecond as_of exactly and converts UTC to the New York form time', () => {
    const file = snapshot()
    file.analysis.as_of = '2026-12-01T05:01:02.999999Z'
    expect(parse(file)).toMatchObject({
      asOf: '2026-12-01T05:01:02.999999Z',
      settings: { as_of: '2026-12-01T00:01:02' },
    })
  })

  it.each(['-04:00', '-05:00'])('re-exports the %s occurrence of the repeated fall-back hour without changing its instant', (offset) => {
    const analyzed = {
      ...meta, baseline_end: '2025-10-01T00:00:00-04:00',
      as_of: `2025-11-02T01:30:00.123456${offset}`,
    }
    const first = createAnalysisSession({
      ...args, settings: { ...settings, baseline_end: '2025-10-01', as_of: '' },
      result: { res: { meta: analyzed }, serverClock: true },
    })
    const restored = parse(first)
    expect(restored.settings.as_of).toBe('2025-11-02T01:30:00')
    const second = createAnalysisSession({
      ...restored, result: { res: { meta: analyzed }, serverClock: false },
    })
    expect(second.analysis.as_of).toBe(analyzed.as_of)
    expect(second.analysis).toEqual(first.analysis)
    expect(() => createAnalysisSession({
      ...restored, settings: { ...restored.settings, as_of: '2025-11-02T01:31:00' },
      result: { res: { meta: analyzed } },
    })).toThrow(/settings.*analysis/i)
  })

  it('accepts an unchanged server-clock form and equivalent minute-resolution displayed settings', () => {
    const file = snapshot()
    expect(file.analysis.as_of).toBe(meta.as_of)
    const restored = parse(file)
    expect(createAnalysisSession({ ...restored, result }).analysis.as_of).toBe(meta.as_of)
    expect(createAnalysisSession({
      ...restored, settings: { ...restored.settings, as_of: '2026-10-01T00:00' }, result,
    }).analysis.as_of).toBe(meta.as_of)
  })

  it('distinguishes two analyses that have identical raw records but different targets', () => {
    const ten = snapshot()
    const twelve = createAnalysisSession({
      ...args, settings: { ...settings, target_minutes: '12' },
      result: { res: { meta: { ...meta, target_minutes: 12 } } },
    })
    expect(twelve.records).toEqual(ten.records)
    expect(twelve.analysis.target_minutes).toBe(12)
    expect(ten.analysis.target_minutes).toBe(10)
    expect(JSON.stringify(twelve)).not.toBe(JSON.stringify(ten))
  })

  it('freezes copies without rewriting or trimming record values', () => {
    const file = snapshot()
    file.records[0].note = 'changed'
    file.analysis.reviewed_zones.push('B')
    expect(records[0].note).toContain('line 1')
    expect(meta.reviewed_zones).toEqual(['A'])
    expect(parse(snapshot()).records[0].incident_id).toBe('0001')
  })

  it('requires a current analyzed result and rejects settings/results mismatches', () => {
    expect(() => createAnalysisSession({ ...args, result: null })).toThrow(/current analysis/i)
    for (const patch of [
      { target_minutes: '12' }, { selected_priority: 'P2' },
      { baseline_end: '2026-09-20' }, { as_of: '2026-10-02T00:00:00' },
    ]) {
      expect(() => createAnalysisSession({ ...args, settings: { ...settings, ...patch } })).toThrow(/settings.*analysis/i)
    }
  })

  it('marks mock calculations rather than preserving a real-data claim', () => {
    const file = createAnalysisSession({ ...args, result: { res: { meta: { ...meta, is_mock: true } } } })
    expect(file.provenance.kind).toBe('mock')
    expect(parse(file).provenance.imported).toBe(true)
  })

  it('never treats uploaded names or imported provenance as independently verified', () => {
    const file = createAnalysisSession({ ...args, source: 'real_verified.csv', provenance: { kind: 'user_upload', label: 'User upload (origin unverified)' } })
    expect(parse(file).provenance).toEqual({ kind: 'user_upload', label: 'User upload (origin unverified)', imported: true })
  })

  it.each([
    ['unknown schema', (f) => { f.schema = 'other' }],
    ['unsupported version', (f) => { f.version = 2 }],
    ['unknown fields', (f) => { f.signals = [{ status: 'high' }] }],
    ['invalid target', (f) => { f.analysis.target_minutes = 0 }],
    ['invalid target type', (f) => { f.analysis.target_minutes = '10' }],
    ['nonfinite target', (f) => { f.analysis.target_minutes = null }],
    ['blank priority', (f) => { f.analysis.selected_priority = '' }],
    ['invalid timezone', (f) => { f.analysis.timezone = 'UTC' }],
    ['unoffset as_of', (f) => { f.analysis.as_of = '2026-10-01T04:00:00' }],
    ['impossible as_of', (f) => { f.analysis.as_of = '2026-02-30T04:00:00Z' }],
    ['invalid hour', (f) => { f.analysis.as_of = '2026-10-01T24:00:00Z' }],
    ['invalid cutoff', (f) => { f.analysis.baseline_end = '2026-09-21T01:00:00-04:00' }],
    ['cutoff after observation', (f) => { f.analysis.baseline_end = '2026-10-02T00:00:00-04:00' }],
    ['duplicate confirmations', (f) => { f.analysis.reviewed_zones = ['A', 'A'] }],
    ['bad confirmations', (f) => { f.analysis.reviewed_zones = [null] }],
    ['missing column', (f) => { delete f.records[0].on_scene_at }],
    ['numeric cell', (f) => { f.records[0].incident_id = 123 }],
    ['nested cell', (f) => { f.records[0].note = { html: 'bad' } }],
    ['invalid provenance', (f) => { f.provenance.kind = 'verified' }],
    ['invalid selected date', (f) => { f.selection.date = '2026-02-30' }],
    ['invalid focus', (f) => { f.focus = null }],
  ])('rejects %s before session replacement', (_, mutate) => {
    const file = snapshot()
    mutate(file)
    expect(() => parse(file)).toThrow(/analysis (file|snapshot)/i)
  })

  it('reports malformed JSON, and accepts a UTF-8 BOM', () => {
    expect(() => parseAnalysisSession('{bad')).toThrow(/JSON/)
    expect(parseAnalysisSession('\ufeff' + JSON.stringify(snapshot())).records).toEqual(records)
  })

  it('supports header-only empty records and an empty current selection', () => {
    const file = createAnalysisSession({ ...args, records: [], selection: undefined, focus: undefined })
    expect(parse(file)).toMatchObject({ records: [], selection: { zone: '', date: '' }, focus: { zone: '', date: '' } })
  })
})

describe('DataSettings snapshot controls', () => {
  const props = {
    records: [], source: '', settings, res: null, busy: false,
    onRecords() {}, onSettings() {}, onRun() {}, onShowChart() {}, onLoadExample() {},
    onInputIntent() {}, onImportFile() {}, onExportSession() {},
  }
  it('makes records-only CSV and reproducible JSON separate, with both accepted on import', () => {
    const html = renderToStaticMarkup(createElement(DataSettings, props))
    expect(html).toContain('Import CSV / analysis JSON')
    expect(html).toContain('Export CSV (records only)')
    expect(html).toContain('disabled="">Export analysis JSON')
    expect(html).toContain('.json,application/json')
    expect(html).toContain('baseline confirmations')
  })
})
