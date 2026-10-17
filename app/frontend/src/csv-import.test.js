import { describe, expect, it, vi } from 'vitest'
import { COLUMNS, parseIncidents, toCsv } from './csv.js'
import { createRequestLifecycle } from './request-lifecycle.js'

const HEADER = COLUMNS.join(',')

describe('malformed CSV imports preserve the last valid analysis session', () => {
  it.each([
    ['unclosed note', `${HEADER},review_note\nQ1,A,P1,t,t,"unclosed\nQ2,B,P1,t,t,swallowed\n`, /Unclosed quoted field/],
    ['extra cell', `${HEADER}\nQ1,A,P1,t,t,extra\n`, /has 6 fields; expected 5/],
    ['short record', `${HEADER}\nQ1,A,P1,t\n`, /has 4 fields; expected 5/],
    ['repeated header', `${HEADER},zone\nQ1,A,P1,t,t,B\n`, /Duplicate column name/],
    ['blank header', `${HEADER},\nQ1,A,P1,t,t,note\n`, /has no name/],
  ])('rejects %s without mutating records, settings, review or result', async (_, text, message) => {
    const session = {
      records: [{ incident_id: 'original', zone: 'A', priority: 'P1', dispatched_at: 't', on_scene_at: 't' }],
      source: 'previous.csv', settings: { target_minutes: '12', selected_priority: 'P1' },
      reviewed: ['A'], result: { marker: 'previous successful server response' },
    }
    const prior = structuredClone(session)
    const onDataset = vi.fn((next) => Object.assign(session, next, { reviewed: [], result: null }))
    const onResult = vi.fn((result) => { session.result = result })
    const onErrors = vi.fn(), onBusy = vi.fn(), analyze = vi.fn()
    const lifecycle = createRequestLifecycle({ parseIncidents, analyze,
      onDataset, onResult, onErrors, onBusy, onNavigate: vi.fn() })

    expect(await lifecycle.importFile({ name: 'bad.csv', text: async () => text })).toBe(false)
    expect(session).toEqual(prior)
    expect(onDataset).not.toHaveBeenCalled()
    expect(onResult).not.toHaveBeenCalled()
    expect(analyze).not.toHaveBeenCalled()
    expect(onErrors.mock.lastCall[0][0]).toMatch(message)
    expect(onErrors.mock.lastCall[0][0]).toMatch(/^bad\.csv:/)
    expect(onBusy.mock.lastCall).toEqual([false])

    // A rejected file must not poison the next valid import.
    expect(await lifecycle.importFile({ name: 'valid.csv', text: async () => toCsv(prior.records) })).toBe(true)
    expect(onDataset).toHaveBeenCalledTimes(1)
    expect(session.source).toBe('valid.csv')
    expect(onErrors.mock.lastCall).toEqual([[]])
  })
})
