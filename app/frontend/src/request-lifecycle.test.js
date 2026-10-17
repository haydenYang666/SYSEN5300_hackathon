import { describe, expect, it, vi } from 'vitest'
import { parseIncidents, toCsv } from './csv.js'
import { nyLocalToIso, nyMidnightIso } from './time.js'
import { createRequestLifecycle } from './request-lifecycle.js'

// Transport fixtures only: no statistical outputs are invented or asserted.
const row = (id) => ({
  incident_id: id, zone: 'A', priority: 'P1',
  dispatched_at: '2026-09-01T08:00:00-04:00',
  on_scene_at: '2026-09-01T08:05:00-04:00',
})
const settings = {
  selected_priority: 'P1', target_minutes: '10',
  baseline_end: '2026-09-21', as_of: '2026-10-01T00:00:00',
}
const example = (id) => ({
  url: `${id}.csv`, file: `${id}.csv`, settings: { ...settings },
})
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const csvResponse = (id) => ({ ok: true, text: async () => toCsv([row(id)]) })
const reply = (req) => ({
  request_marker: req.records[0]?.incident_id,
  meta: {
    target_minutes: req.target_minutes, reviewed_zones: req.reviewed_zones,
    as_of: req.as_of ?? '2026-10-16T12:00:00-04:00',
  },
})
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

const snapshot = () => ({
  schema: 'response-late-rate-analysis', version: 1, records: [row('restored')], source: 'restored.csv',
  provenance: { kind: 'synthetic', label: 'Synthetic test transport' },
  analysis: { timezone: 'America/New_York', selected_priority: 'P1', target_minutes: 12,
    baseline_end: '2026-09-21T00:00:00-04:00', as_of: '2026-10-01T00:00:00.123456-04:00', reviewed_zones: ['A'] },
  selection: { zone: 'A', date: '2026-09-22' }, focus: { zone: 'B', date: '2026-09-22' },
})

function harness({ analyze = vi.fn(async (req) => reply(req)),
  fetchExample = vi.fn(async () => csvResponse('example')) } = {}) {
  const state = { records: [row('original')], source: 'original.csv',
    settings: { ...settings }, result: null, busy: false, errors: [] }
  const onBusy = vi.fn((busy) => { state.busy = busy })
  const onErrors = vi.fn((errors) => { state.errors = errors })
  const onDataset = vi.fn(({ records, source, settings: nextSettings }) => {
    state.records = records
    state.source = source
    if (nextSettings) state.settings = nextSettings
    state.result = null
  })
  const onResult = vi.fn((result) => { state.result = result })
  const onNavigate = vi.fn()
  const lifecycle = createRequestLifecycle({ analyze, fetchExample, parseIncidents,
    onBusy, onErrors, onDataset, onResult, onNavigate })
  const buildRequest = (ctx = state, reviewed = [], asOf) => ({
    records: ctx.records, target_minutes: Number(ctx.settings.target_minutes),
    selected_priority: ctx.settings.selected_priority,
    baseline_end: nyMidnightIso(ctx.settings.baseline_end), reviewed_zones: reviewed,
    ...(asOf || ctx.settings.as_of ? { as_of: asOf ?? nyLocalToIso(ctx.settings.as_of) } : {}),
  })
  const editSettings = (patch) => {
    lifecycle.cancel()
    state.settings = { ...state.settings, ...patch }
    state.result = null
  }
  return { lifecycle, state, analyze, fetchExample, buildRequest, editSettings,
    onBusy, onErrors, onDataset, onResult, onNavigate }
}

describe('snapshot imports are validated and recalculated before replacing the current session', () => {
  const file = (value = snapshot()) => ({ name: 'analysis.json', text: async () => JSON.stringify(value) })
  const options = (h) => ({ buildRequest: (session) => h.buildRequest(session, session.reviewedZones, session.asOf) })

  it('restores exact analyzed parameters and metadata only after API success', async () => {
    const pending = deferred()
    const h = harness({ analyze: vi.fn(() => pending.promise) })
    const prior = h.state.records
    const loading = h.lifecycle.importFile(file(), options(h))
    await flush()
    expect(h.state.records).toBe(prior)
    expect(h.onDataset).not.toHaveBeenCalled()
    const request = h.analyze.mock.calls[0][0]
    expect(request).toMatchObject({ target_minutes: 12, reviewed_zones: ['A'],
      as_of: '2026-10-01T00:00:00.123456-04:00' })
    pending.resolve(reply(request))
    expect(await loading).toBe(true)
    expect(h.state.source).toBe('restored.csv')
    expect(h.state.result.res.meta.target_minutes).toBe(12)
    expect(h.onDataset.mock.calls[0][0]).toMatchObject({ provenance: { kind: 'synthetic', imported: true },
      selection: { zone: 'A', date: '2026-09-22' }, focus: { zone: 'B', date: '2026-09-22' } })
  })

  it.each([422, 503, 0])('retains the previous analysis and records after HTTP %s / network failure', async (status) => {
    const h = harness({ analyze: vi.fn(async () => { throw Object.assign(new Error('rejected'), { status }) }) })
    const prior = { res: { marker: 'previous successful analysis' }, serverClock: false }
    h.state.result = prior
    const records = h.state.records, settings = h.state.settings
    expect(await h.lifecycle.importFile(file(), options(h))).toBe(false)
    expect(h.state.result).toBe(prior)
    expect(h.state.records).toBe(records)
    expect(h.state.settings).toBe(settings)
    expect(h.onDataset).not.toHaveBeenCalled()
    expect(h.state.errors.join(' ')).toContain('rejected')
  })

  it('rejects malformed snapshots without analyzing or clearing the old result', async () => {
    const h = harness()
    h.state.result = { res: { marker: 'prior' } }
    const prior = h.state.result
    expect(await h.lifecycle.importFile(file({ ...snapshot(), version: 99 }), options(h))).toBe(false)
    expect(h.state.result).toBe(prior)
    expect(h.analyze).not.toHaveBeenCalled()
    expect(h.onDataset).not.toHaveBeenCalled()
  })

  it('does not replace a newer manual import when an obsolete snapshot API call finishes', async () => {
    const pending = deferred()
    const h = harness({ analyze: vi.fn(() => pending.promise) })
    const loading = h.lifecycle.importFile(file(), options(h))
    await flush()
    await h.lifecycle.importFile({ name: 'newer.csv', text: async () => toCsv([row('newer')]) })
    pending.resolve(reply(h.analyze.mock.calls[0][0]))
    expect(await loading).toBe(false)
    expect(h.state.source).toBe('newer.csv')
    expect(h.state.result).toBeNull()
    expect(h.onDataset).toHaveBeenCalledTimes(1)
    expect(h.onDataset.mock.calls[0][0].provenance.kind).toBe('user_upload')
  })
})

describe('one lifecycle spans example fetching, CSV reading and API analysis', () => {
  it.each(['headers', 'body'])('a manual import wins over an example delayed at %s', async (stage) => {
    const pending = deferred()
    const fetchExample = vi.fn(() => stage === 'headers'
      ? pending.promise : Promise.resolve({ ok: true, text: () => pending.promise }))
    const h = harness({ fetchExample })
    const loading = h.lifecycle.loadExample({ example: example('stable'),
      buildRequest: h.buildRequest, openDashboard: true })
    await flush()
    expect(await h.lifecycle.importFile({ name: 'my-file.csv', text: async () => toCsv([row('mine')]) })).toBe(true)
    const resultWrites = h.onResult.mock.calls.length
    pending.resolve(stage === 'headers' ? csvResponse('stable') : toCsv([row('stable')]))
    expect(await loading).toBe(false)
    expect(h.state.source).toBe('my-file.csv')
    expect(h.state.records[0].incident_id).toBe('mine')
    expect(h.analyze).not.toHaveBeenCalled()
    expect(h.onResult).toHaveBeenCalledTimes(resultWrites)
    expect(h.onNavigate).not.toHaveBeenCalled()
    expect(fetchExample.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('a settings edit cancels first-visit loading before it can replace data or navigate', async () => {
    const pending = deferred()
    const h = harness({ fetchExample: vi.fn(() => pending.promise) })
    const loading = h.lifecycle.loadExample({ example: example('stable'),
      buildRequest: h.buildRequest, openDashboard: true })
    h.editSettings({ target_minutes: '20' })
    pending.resolve(csvResponse('stable'))
    expect(await loading).toBe(false)
    expect(h.state.settings.target_minutes).toBe('20')
    expect(h.state.source).toBe('original.csv')
    expect(h.state.records[0].incident_id).toBe('original')
    expect(h.onDataset).not.toHaveBeenCalled()
    expect(h.onNavigate).not.toHaveBeenCalled()
    expect(h.state.busy).toBe(false)
    expect(h.state.errors).toEqual([])
  })

  it('rejects an example target-10 response after target-20 editing, including its navigation', async () => {
    const pending = deferred()
    const h = harness({ analyze: vi.fn(() => pending.promise) })
    const loading = h.lifecycle.loadExample({ example: example('nyc'),
      buildRequest: h.buildRequest, openDashboard: true })
    await flush()
    expect(h.analyze).toHaveBeenCalledTimes(1)
    const oldRequest = h.analyze.mock.calls[0][0]
    expect(oldRequest.target_minutes).toBe(10)
    h.editSettings({ target_minutes: '20' })
    pending.resolve(reply(oldRequest))
    expect(await loading).toBe(false)
    expect(h.state.settings.target_minutes).toBe('20')
    expect(h.state.result).toBeNull()
    expect(h.state.errors).toEqual([])
    expect(h.state.busy).toBe(false)
    expect(h.onNavigate).not.toHaveBeenCalled()
    expect(h.analyze.mock.calls[0][2].signal.aborted).toBe(true)
  })

  it('latest example wins even when the older fetch ignores abort and finishes last', async () => {
    const older = deferred(), newer = deferred()
    const fetchExample = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const h = harness({ fetchExample })
    const first = h.lifecycle.loadExample({ example: example('stable'), buildRequest: h.buildRequest, openDashboard: true })
    const second = h.lifecycle.loadExample({ example: example('shift'), buildRequest: h.buildRequest, openDashboard: true })
    newer.resolve(csvResponse('shift'))
    expect(await second).toBe(true)
    const result = h.state.result
    older.resolve(csvResponse('stable'))
    expect(await first).toBe(false)
    expect(h.state.source).toBe('shift.csv')
    expect(h.state.records[0].incident_id).toBe('shift')
    expect(h.state.result).toBe(result)
    expect(h.analyze).toHaveBeenCalledTimes(1)
    expect(h.onNavigate).toHaveBeenCalledTimes(1)
    expect(fetchExample.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it.each(['success', 'failure'])('late file-read %s cannot overwrite the later file selection', async (outcome) => {
    const older = deferred(), newer = deferred()
    const h = harness()
    const first = h.lifecycle.importFile({ name: 'old.csv', text: () => older.promise })
    const second = h.lifecycle.importFile({ name: 'new.csv', text: () => newer.promise })
    newer.resolve(toCsv([row('new')]))
    expect(await second).toBe(true)
    if (outcome === 'success') older.resolve(toCsv([row('old')]))
    else older.reject(new Error('old file became unreadable'))
    expect(await first).toBe(false)
    expect(h.state.source).toBe('new.csv')
    expect(h.state.records[0].incident_id).toBe('new')
    expect(h.state.errors).toEqual([])
    expect(h.onDataset).toHaveBeenCalledTimes(1)
    expect(h.analyze).not.toHaveBeenCalled()
  })

  it('a settings edit also invalidates an in-flight non-abortable File.text read', async () => {
    const pending = deferred()
    const h = harness()
    const importing = h.lifecycle.importFile({ name: 'late.csv', text: () => pending.promise })
    h.editSettings({ selected_priority: 'P2' })
    pending.resolve(toCsv([row('late')]))
    expect(await importing).toBe(false)
    expect(h.state.source).toBe('original.csv')
    expect(h.state.settings.selected_priority).toBe('P2')
    expect(h.state.busy).toBe(false)
  })
})

describe('stale results, errors, finalizers and deferred navigation are all ignored', () => {
  it.each(['success', 'failure'])('an older analysis %s cannot stop or alter the newer analysis', async (outcome) => {
    const older = deferred(), newer = deferred()
    const analyze = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const h = harness({ analyze })
    const first = h.lifecycle.runAnalysis({ buildRequest: h.buildRequest })
    h.editSettings({ target_minutes: '20' })
    const second = h.lifecycle.runAnalysis({ buildRequest: h.buildRequest })
    const currentWrites = { busy: h.onBusy.mock.calls.length, errors: h.onErrors.mock.calls.length,
      result: h.onResult.mock.calls.length }
    if (outcome === 'success') older.resolve(reply(analyze.mock.calls[0][0]))
    else older.reject(Object.assign(new Error('stale rejected input'), { status: 422, fields: ['records'] }))
    expect(await first).toBe(false)
    expect(h.state.busy).toBe(true)
    expect(h.state.errors).toEqual([])
    expect(h.state.result).toBeNull()
    expect(h.onBusy).toHaveBeenCalledTimes(currentWrites.busy)
    expect(h.onErrors).toHaveBeenCalledTimes(currentWrites.errors)
    expect(h.onResult).toHaveBeenCalledTimes(currentWrites.result)
    newer.resolve(reply(analyze.mock.calls[1][0]))
    expect(await second).toBe(true)
    expect(h.state.result.res.meta.target_minutes).toBe(20)
    expect(h.state.busy).toBe(false)
  })

  it('an old fetch failure and finally cannot replace a newer file-read operation', async () => {
    const download = deferred(), read = deferred()
    const h = harness({ fetchExample: vi.fn(() => download.promise) })
    const first = h.lifecycle.loadExample({ example: example('stable'), buildRequest: h.buildRequest, openDashboard: true })
    const second = h.lifecycle.importFile({ name: 'new.csv', text: () => read.promise })
    download.reject(new Error('stale network failure'))
    expect(await first).toBe(false)
    expect(h.state.busy).toBe(true)
    expect(h.state.errors).toEqual([])
    read.resolve(toCsv([row('new')]))
    expect(await second).toBe(true)
    expect(h.state.source).toBe('new.csv')
    expect(h.onNavigate).not.toHaveBeenCalled()
  })

  it('guards navigation even when React applies the page updater after another user action', async () => {
    const h = harness()
    expect(await h.lifecycle.loadExample({ example: example('stable'), buildRequest: h.buildRequest, openDashboard: true })).toBe(true)
    const operation = h.onNavigate.mock.calls[0][0]
    expect(operation.isCurrent()).toBe(true)
    h.editSettings({ target_minutes: '20' })
    expect(operation.isCurrent()).toBe(false)
  })

  it('disposal prevents late callbacks and a new setup can start normally', async () => {
    const pending = deferred()
    const analyze = vi.fn().mockReturnValueOnce(pending.promise).mockImplementation(async (req) => reply(req))
    const h = harness({ analyze })
    const first = h.lifecycle.runAnalysis({ buildRequest: h.buildRequest })
    h.lifecycle.dispose()
    const writes = h.onResult.mock.calls.length
    pending.resolve(reply(analyze.mock.calls[0][0]))
    expect(await first).toBe(false)
    expect(h.onResult).toHaveBeenCalledTimes(writes)
    expect(await h.lifecycle.runAnalysis({ buildRequest: h.buildRequest })).toBe(true)
    expect(h.state.busy).toBe(false)
  })
})

describe('normal first-visit, analysis and review behavior is retained', () => {
  it('loads first-visit example settings, analyzes unreviewed records and opens the dashboard', async () => {
    const h = harness()
    const ex = example('first-visit')
    expect(await h.lifecycle.loadExample({ example: ex, buildRequest: h.buildRequest, openDashboard: true })).toBe(true)
    expect(h.state.source).toBe(ex.file)
    expect(h.state.settings).toEqual(ex.settings)
    const [req, mockScenario, options] = h.analyze.mock.calls[0]
    expect(req.records).toBe(h.state.records)
    expect(req.reviewed_zones).toEqual([])
    expect(req.as_of).toBe('2026-10-01T00:00:00-04:00')
    expect(req.target_minutes).toBe(10)
    expect(mockScenario).toBeUndefined()
    expect(options.signal).toBe(h.fetchExample.mock.calls[0][1].signal)
    expect(h.state.result.serverClock).toBe(false)
    expect(h.state.busy).toBe(false)
    expect(h.state.errors).toEqual([])
    expect(h.onNavigate).toHaveBeenCalledTimes(1)
  })

  it('review changes preserve the prior observation time, records and server-clock label', async () => {
    const h = harness()
    h.state.settings.as_of = ''
    expect(await h.lifecycle.runAnalysis({ buildRequest: h.buildRequest })).toBe(true)
    expect(h.state.result.serverClock).toBe(true)
    const { as_of: asOf } = h.state.result.res.meta
    const records = h.state.records
    expect(await h.lifecycle.runAnalysis({
      buildRequest: () => h.buildRequest(h.state, ['A'], asOf), serverClock: h.state.result.serverClock,
    })).toBe(true)
    const reviewed = h.analyze.mock.calls[1][0]
    expect(reviewed.records).toBe(records)
    expect(reviewed.as_of).toBe(asOf)
    expect(reviewed.reviewed_zones).toEqual(['A'])
    expect(h.state.result.serverClock).toBe(true)
    expect(h.onNavigate).not.toHaveBeenCalled()
  })

  it('still reports current validation and API failures without navigating', async () => {
    const h = harness()
    expect(await h.lifecycle.runAnalysis({ buildRequest: () => { throw ['Choose a priority.'] } })).toBe(false)
    expect(h.state.errors).toEqual(['Choose a priority.'])
    expect(h.analyze).not.toHaveBeenCalled()
    h.analyze.mockRejectedValueOnce(Object.assign(new Error('invalid target'), { status: 422, fields: ['target_minutes'] }))
    expect(await h.lifecycle.loadExample({ example: example('stable'), buildRequest: h.buildRequest, openDashboard: true })).toBe(false)
    expect(h.state.errors).toEqual(['The API rejected the request (HTTP 422).', 'invalid target', 'Field(s): target_minutes'])
    expect(h.state.result).toBeNull()
    expect(h.state.busy).toBe(false)
    expect(h.onNavigate).not.toHaveBeenCalled()
  })

  it('checks failed example HTTP responses before replacing the current dataset', async () => {
    const text = vi.fn(async () => toCsv([row('unwanted')]))
    const h = harness({ fetchExample: vi.fn(async () => ({ ok: false, status: 404, text })) })
    expect(await h.lifecycle.loadExample({ example: example('missing'), buildRequest: h.buildRequest })).toBe(false)
    expect(text).not.toHaveBeenCalled()
    expect(h.state.source).toBe('original.csv')
    expect(h.state.errors).toEqual(['Could not load the example missing.csv: HTTP 404'])
    expect(h.onDataset).not.toHaveBeenCalled()
    expect(h.analyze).not.toHaveBeenCalled()
    expect(h.state.busy).toBe(false)
  })
})
