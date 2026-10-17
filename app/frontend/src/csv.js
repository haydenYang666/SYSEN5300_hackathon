// CSV import/export for the five incident columns. Parsing only: values stay
// as text and every validity check (timestamps, duplicates, order) is done by
// the server, which reports row-level exclusions.

export const COLUMNS = ['incident_id', 'zone', 'priority', 'dispatched_at', 'on_scene_at']

/** Split CSV text into rows of fields, rejecting malformed RFC 4180 quotes. */
export function parseRows(text) {
  const rows = []
  let row = []
  let field = ''
  let state = 'plain'
  let quoteStart = 0
  let rowTouched = false
  const location = (index) => {
    const lines = text.slice(0, index).split(/\r\n|\r|\n/)
    return `line ${lines.length}, column ${lines.at(-1).length + 1}`
  }
  const finishField = () => {
    row.push(field)
    field = ''
    state = 'plain'
  }
  const finishRow = () => {
    finishField()
    // Ignore physically empty/whitespace-only lines, not explicit empty cells.
    if (rowTouched) rows.push(row)
    row = []
    rowTouched = false
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (state === 'quoted') {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') state = 'closed'
      else field += c
    } else if (c === ',') {
      rowTouched = true
      finishField()
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      finishRow()
    } else if (state === 'closed') {
      throw new Error(`Unexpected character after closing quote at ${location(i)}; expected a comma or line ending.`)
    } else if (c === '"') {
      if (field !== '') throw new Error(`Unexpected quote at ${location(i)}; quotes must enclose the entire field.`)
      state = 'quoted'
      quoteStart = i
      rowTouched = true
    } else {
      field += c
      if (c.trim() !== '') rowTouched = true
    }
  }
  if (state === 'quoted') throw new Error(`Unclosed quoted field starting at ${location(quoteStart)}.`)
  if (rowTouched) finishRow()
  return rows
}

/**
 * Parse an incident CSV into records. Throws if a required column is missing
 * (the API would answer 422). The five required values are trimmed; extra
 * columns are kept exactly as written (interfaces v1.0 section 3: the core
 * ignores them, the browser keeps them for export). Empty cells become ''.
 * Ambiguous headers and ragged records are rejected rather than dropping data.
 */
export function parseIncidents(text) {
  const rows = parseRows(text.replace(/^﻿/, ''))
  if (rows.length === 0) throw new Error('The file is empty.')
  const header = rows[0].map((h) => h.trim())
  const names = new Set()
  header.forEach((name, i) => {
    if (!name) throw new Error(`Column ${i + 1} has no name.`)
    if (names.has(name)) throw new Error(`Duplicate column name: ${name}.`)
    names.add(name)
  })
  const missing = COLUMNS.filter((c) => !header.includes(c))
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`)
  const required = new Set(COLUMNS)
  return rows.slice(1).map((r, rowIndex) => {
    if (r.length !== header.length) {
      throw new Error(`CSV record ${rowIndex + 2} has ${r.length} fields; expected ${header.length}. Use explicit empty cells for missing values.`)
    }
    return Object.fromEntries(header.map((name, i) => {
      const v = r[i]
      return [name, required.has(name) ? v.trim() : v]
    }))
  })
}

/** Column names that are not among the five required ones, in first-seen order. */
export function extraColumns(records) {
  const required = new Set(COLUMNS)
  const seen = new Set()
  for (const r of records) for (const k of Object.keys(r)) if (!required.has(k)) seen.add(k)
  return [...seen]
}

const quote = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Records back to CSV: the five columns first, then every extra column. */
export function toCsv(records) {
  const cols = [...COLUMNS, ...extraColumns(records)]
  return [cols.map(quote).join(','), ...records.map((r) => cols.map((c) => quote(r[c])).join(','))].join('\n') + '\n'
}
