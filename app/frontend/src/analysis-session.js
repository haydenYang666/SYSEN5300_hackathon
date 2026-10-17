// A portable ordinary analysis: original records plus the settings actually
// analyzed. Results are deliberately omitted and must be recalculated by the API.
import { COLUMNS } from './csv.js'
import { TZ } from './time.js'

const SCHEMA = 'response-late-rate-analysis'
const VERSION = 1
const KINDS = new Set(['synthetic', 'public_historical', 'user_upload', 'mixed', 'mock'])
const localFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const fail = (message) => { throw new Error(`Invalid analysis snapshot: ${message}`) }
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, name, allowEmpty = false) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail(`${name} must be text`)
  return value
}

function keys(value, required, optional = [], name = 'file') {
  if (!object(value)) fail(`${name} must be an object`)
  if (required.some((key) => !Object.hasOwn(value, key))) fail(`${name} has missing fields`)
  const allowed = new Set([...required, ...optional])
  if (Object.keys(value).some((key) => !allowed.has(key))) fail(`${name} has unsupported fields`)
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function timestamp(value, name) {
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/)
  if (!match || !calendarDate(match[1]) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59) {
    fail(`${name} must be a valid ISO timestamp with a UTC offset`)
  }
  if (match[5] !== 'Z') {
    const [h, m] = match[5].slice(1).split(':').map(Number)
    if (h > 23 || m > 59) fail(`${name} has an invalid UTC offset`)
  }
  if (!Number.isFinite(Date.parse(value))) fail(`${name} is not a valid timestamp`)
  return value
}

function nyLocal(value) {
  const parts = Object.fromEntries(localFormat.formatToParts(new Date(value)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

function selection(value, name) {
  keys(value, ['zone', 'date'], [], name)
  text(value.zone, `${name}.zone`, true)
  text(value.date, `${name}.date`, true)
  if (value.date && !calendarDate(value.date)) fail(`${name}.date must be a valid calendar date`)
  return { zone: value.zone, date: value.date }
}

function validate(file) {
  keys(file, ['schema', 'version', 'records', 'source', 'provenance', 'analysis', 'selection', 'focus'])
  if (file.schema !== SCHEMA || file.version !== VERSION) fail('unsupported file type or version')
  if (!Array.isArray(file.records)) fail('records must be an array')
  const records = file.records.map((row, i) => {
    if (!object(row) || COLUMNS.some((column) => !Object.hasOwn(row, column))) fail(`row ${i + 1} is missing required columns`)
    if (Object.values(row).some((value) => typeof value !== 'string')) fail(`row ${i + 1} cells must all be strings`)
    // Object.fromEntries retains even unusual extra column names as own data
    // properties; no record property is ever merged into an application object.
    return Object.fromEntries(Object.entries(row))
  })
  text(file.source, 'source', true)
  keys(file.provenance, ['kind', 'label'], ['imported'], 'provenance')
  if (!KINDS.has(file.provenance.kind)) fail('unknown provenance kind')
  text(file.provenance.label, 'provenance.label')
  if (file.provenance.imported !== undefined && typeof file.provenance.imported !== 'boolean') fail('provenance.imported must be boolean')

  const a = file.analysis
  keys(a, ['timezone', 'selected_priority', 'target_minutes', 'baseline_end', 'as_of', 'reviewed_zones'], [], 'analysis')
  if (a.timezone !== TZ) fail(`timezone must be ${TZ}`)
  text(a.selected_priority, 'selected_priority')
  if (typeof a.target_minutes !== 'number' || !Number.isFinite(a.target_minutes) || a.target_minutes <= 0) fail('target_minutes must be a positive finite number')
  timestamp(a.baseline_end, 'baseline_end')
  timestamp(a.as_of, 'as_of')
  if (!nyLocal(a.baseline_end).endsWith('T00:00:00') || /\.\d*[1-9]/.test(a.baseline_end)) fail('baseline_end must be New York midnight')
  if (Date.parse(a.baseline_end) > Date.parse(a.as_of)) fail('baseline_end must not follow as_of')
  if (!Array.isArray(a.reviewed_zones) || a.reviewed_zones.some((zone) => typeof zone !== 'string' || !zone.trim())
    || new Set(a.reviewed_zones).size !== a.reviewed_zones.length) fail('reviewed_zones must be distinct zone names')
  return {
    ...file, records,
    provenance: { ...file.provenance },
    analysis: { ...a, reviewed_zones: [...a.reviewed_zones] },
    selection: selection(file.selection, 'selection'), focus: selection(file.focus, 'focus'),
  }
}

/** Export only the currently analyzed settings, never a stale form or result. */
export function createAnalysisSession({ records, source = '', provenance, settings, result, selection: picked, focus }) {
  const res = result?.res ?? result
  if (!res?.meta) throw new Error('Run a current analysis before exporting analysis JSON.')
  const m = res.meta
  const file = validate({
    schema: SCHEMA, version: VERSION, records, source,
    provenance: m.is_mock ? { kind: 'mock', label: 'Mock calculation' }
      : provenance ?? { kind: 'user_upload', label: 'User upload (origin unverified)' },
    analysis: {
      timezone: m.timezone, selected_priority: m.selected_priority, target_minutes: m.target_minutes,
      baseline_end: m.baseline_end, as_of: m.as_of, reviewed_zones: m.reviewed_zones,
    },
    selection: picked ?? { zone: '', date: '' }, focus: focus ?? { zone: '', date: '' },
  })
  let matches = settings && Number(settings.target_minutes) === m.target_minutes
    && settings.selected_priority === m.selected_priority
    && settings.baseline_end === nyLocal(m.baseline_end).slice(0, 10)
  if (matches && settings.as_of) {
    // Compare what the form can display, not a guessed offset: 01:30 occurs
    // twice when DST ends. The exact instant remains m.as_of in the file.
    const wall = typeof settings.as_of === 'string'
      && settings.as_of.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?$/)
    matches = !!wall && `${wall[1]}:${wall[2] ?? '00'}` === nyLocal(m.as_of)
  }
  if (!matches) throw new Error('Settings no longer match the current analysis. Run the analysis again before exporting.')
  return file
}

/** Validate before replacing any session state. Imported labels are declarations,
 * not proof of the data's origin. The caller recomputes through the real API. */
export function parseAnalysisSession(textContent) {
  let file
  try { file = JSON.parse(textContent.replace(/^\uFEFF/, '')) } catch { fail('the analysis file is not valid JSON') }
  const valid = validate(file)
  const a = valid.analysis
  return {
    records: valid.records, source: valid.source,
    provenance: { ...valid.provenance, imported: true },
    settings: {
      selected_priority: a.selected_priority, target_minutes: String(a.target_minutes),
      baseline_end: nyLocal(a.baseline_end).slice(0, 10), as_of: nyLocal(a.as_of),
    },
    reviewedZones: a.reviewed_zones, asOf: a.as_of,
    selection: valid.selection, focus: valid.focus,
  }
}
