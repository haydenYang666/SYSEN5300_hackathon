// H-10 acceptance against a running real API; no stored or mock response.
// Required: STAKEHOLDER_API_URL (base URL). Optional: STAKEHOLDER_QUALITY_CSV
// pointing to the original synthetic maya-quality.csv stakeholder fixture.
// Run from any directory: node app/frontend/acceptance/stakeholder/session-parity.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parseIncidents, toCsv } from '../../src/csv.js'
import { createAnalysisSession, parseAnalysisSession } from '../../src/analysis-session.js'
import { nyLocalToIso, nyMidnightIso } from '../../src/time.js'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const base = process.env.STAKEHOLDER_API_URL
assert.ok(base, 'Set STAKEHOLDER_API_URL to the real API base URL before running.')
const endpoint = new URL(`${base.replace(/\/$/, '')}/analyze`)
assert.ok(['http:', 'https:'].includes(endpoint.protocol), 'The API must use HTTP or HTTPS.')

const files = [
  'real_nyc_brooklyn_queens_sev2.csv',
  'jingyao_synthetic/stable.csv', 'jingyao_synthetic/zone_shift.csv', 'jingyao_synthetic/edge_cases.csv',
  'shifeng_synthetic/stable.csv', 'shifeng_synthetic/zone_shift.csv', 'shifeng_synthetic/edge_cases.csv',
]
const data = new Map()
for (const name of files) {
  const records = parseIncidents(await readFile(path.join(root, 'data', name), 'utf8'))
  const exported = toCsv(records)
  const imported = parseIncidents(exported)
  assert.deepStrictEqual(imported, records, `${name}: CSV reimport changed records`)
  assert.equal(toCsv(imported), exported, `${name}: repeated CSV export changed bytes`)
  data.set(name, records)
  console.log(`PASS CSV ${name}: ${records.length} records; exact record and export parity`)
}

let posts = 0
async function analyze(request) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request), signal: AbortSignal.timeout(30000),
  })
  assert.equal(response.status, 200, `The analysis API returned HTTP ${response.status}.`)
  const result = await response.json()
  assert.equal(result.meta.is_mock, false, 'Acceptance requires the real statistical core.')
  posts += 1
  return result
}

const settings = {
  selected_priority: 'P1', target_minutes: '10',
  baseline_end: '2026-09-21', as_of: '2026-10-01T00:00:00',
}
const selected = { zone: 'B', date: '2026-09-22' }
function requestFrom({ records, settings, reviewedZones, asOf }) {
  return {
    records, selected_priority: settings.selected_priority,
    target_minutes: Number(settings.target_minutes),
    baseline_end: nyMidnightIso(settings.baseline_end),
    as_of: asOf ?? nyLocalToIso(settings.as_of), reviewed_zones: reviewedZones,
  }
}

async function roundTrip(records, source, formSettings, reviewedZones = ['A', 'B']) {
  const request = requestFrom({ records, settings: formSettings, reviewedZones })
  const original = await analyze(request)
  const snapshot = createAnalysisSession({
    records, source, settings: formSettings, result: { res: original, serverClock: false },
    provenance: { kind: 'synthetic', label: 'Synthetic acceptance dataset' },
    selection: selected, focus: selected,
  })
  const restored = parseAnalysisSession(JSON.stringify(snapshot))
  assert.deepStrictEqual(restored.records, records, 'Snapshot changed original cells or excluded records.')
  assert.deepStrictEqual(restored.selection, selected)
  assert.deepStrictEqual(restored.focus, selected)
  assert.equal(restored.provenance.kind, 'synthetic')
  assert.equal(restored.provenance.imported, true, 'Imported provenance must remain unverified.')
  assert.deepStrictEqual(restored.reviewedZones, reviewedZones)
  const restoredRequest = requestFrom(restored)
  // The API expresses as_of in UTC. Preserve its exact instant, regardless of
  // whether the original form sent an equivalent New York offset string.
  const { as_of: savedAsOf, ...savedFields } = restoredRequest
  const { as_of: initialAsOf, ...initialFields } = request
  assert.equal(Date.parse(savedAsOf), Date.parse(initialAsOf), 'Restored observation instant changed.')
  assert.deepStrictEqual(savedFields, initialFields, 'Restored API inputs differ from the original.')
  const recomputed = await analyze(restoredRequest)
  // Compare every returned field, including quality/exclusions, baseline daily
  // summaries, limits/status/reasons, signals and individual late incidents.
  assert.deepStrictEqual(recomputed, original, 'Full API response changed after snapshot restoration.')
  return { original, snapshot, restored }
}

const source = 'jingyao_synthetic/zone_shift.csv'
const records = data.get(source)
const ten = await roundTrip(records, source, settings)
assert.equal(ten.original.quality.overall.total_rows, 12000)
assert.equal(ten.original.quality.overall.usable_rows, 12000)
assert.equal(ten.original.quality.selected_priority.total_rows, 6000)
assert.equal(ten.original.quality.selected_priority.usable_rows, 6000)
assert.equal(ten.original.signals.length, 8)
const day = ten.original.daily_points.find((point) => point.zone === 'B' && point.date === '2026-09-22')
assert.ok(day, 'B / Sep 22 must exist.')
assert.equal(day.late, 15)
assert.equal(day.n, 100)
console.log(`PASS snapshot target 10: full API response deep-equal; 12000 overall / 6000 P1; 8 signals; B Sep 22 = ${day.late}/${day.n} late`)

const twelve = await roundTrip(records, source, { ...settings, target_minutes: '12' })
assert.equal(ten.snapshot.analysis.target_minutes, 10)
assert.equal(twelve.snapshot.analysis.target_minutes, 12)
assert.equal(twelve.restored.settings.target_minutes, '12')
assert.notEqual(twelve.original.late_incidents.length, ten.original.late_incidents.length,
  'Changing the target must produce different late counts for this fixture.')
assert.deepStrictEqual(twelve.snapshot.records, ten.snapshot.records)
assert.equal(toCsv(twelve.restored.records), toCsv(ten.restored.records))
console.log(`PASS target distinction: target 10 = ${ten.original.late_incidents.length} late; target 12 = ${twelve.original.late_incidents.length} late; different saved settings, identical raw CSV; full API response deep-equal after both restores`)

if (process.env.STAKEHOLDER_QUALITY_CSV) {
  const qualityRecords = parseIncidents(await readFile(process.env.STAKEHOLDER_QUALITY_CSV, 'utf8'))
  assert.equal(qualityRecords.length, 10, 'Expected the original 10-row Maya quality fixture.')
  assert.equal(Object.keys(qualityRecords[0]).length, 8)
  assert.equal(qualityRecords[0].unit_code, '001')
  assert.equal(qualityRecords[1].review_note, 'synthetic "quoted" note')
  assert.match(qualityRecords[2].review_note, /\nsecond line/)
  assert.deepStrictEqual(parseIncidents(toCsv(qualityRecords)), qualityRecords)
  const quality = await roundTrip(qualityRecords, 'maya-quality.csv', settings, [])
  assert.equal(quality.original.quality.overall.usable_rows, 3)
  assert.equal(quality.original.quality.overall.excluded_rows, 7)
  assert.equal(quality.original.quality.selected_priority.usable_rows, 2)
  assert.equal(quality.original.quality.selected_priority.excluded_rows, 6)
  assert.equal(quality.original.excluded_records.length, 7)
  console.log('PASS Maya quality: all 10 rows / 8 columns preserved, including leading zeros, multiline/quoted extras and invalid records; 3 usable / 7 excluded overall; 2 usable / 6 excluded P1; full API response deep-equal')
} else {
  console.log('SKIP Maya quality: set STAKEHOLDER_QUALITY_CSV to the original fixture to include this optional check.')
}
console.log(`PASS H-10 session parity: ${files.length} repository CSVs; ${posts} successful real API requests; no cached or mock statistical results`)
