import { describe, expect, it } from 'vitest'
import { calendarScale, consecutiveRuns, observedSpan } from './chart-dates.js'

const dates = ['2026-08-21', '2026-08-24', '2026-08-28', '2026-09-01', '2026-09-05', '2026-09-10', '2026-09-18']
const sparse = dates.map((date) => ({ date, rate: 0.1 }))

describe('calendar display of observed dates', () => {
  it('reports seven observations spanning 29 calendar days, not seven elapsed days', () => {
    expect(observedSpan(sparse)).toEqual({ start: dates[0], end: dates[6], observed: 7, calendarDays: 29, hasGaps: true })
    const scale = calendarScale(sparse, 0, 290)
    expect(scale.slot).toBe(10)
    expect(scale.x(0)).toBe(5)
    expect(scale.x(1)).toBe(35)
    expect(scale.x(6)).toBe(285)
    expect(consecutiveRuns(sparse).map((run) => run.length)).toEqual([1, 1, 1, 1, 1, 1, 1])
  })

  it('breaks at explicit null values as well as absent dates', () => {
    const rows = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-06'].map((date, i) => ({ date, rate: i === 1 ? null : 0.1 }))
    expect(consecutiveRuns(rows).map((run) => run.map(({ index }) => index))).toEqual([[0], [2, 3], [4]])
  })

  it('keeps daily spacing and API known-answer values unchanged', () => {
    const rows = [0, 1, 2].map((i) => ({ date: `2026-09-0${i + 1}`, rate: 0.2, lower: 0.01, upper: 0.19 }))
    const before = structuredClone(rows)
    const scale = calendarScale(rows, 10, 300)
    expect(rows.map((_, i) => scale.x(i))).toEqual([60, 160, 260])
    expect(consecutiveRuns(rows).map((run) => run.length)).toEqual([3])
    expect(observedSpan(rows).hasGaps).toBe(false)
    expect(rows).toEqual(before)
  })

  it('handles no observations and a single observation without inventing a day', () => {
    expect(observedSpan([])).toEqual({ start: null, end: null, observed: 0, calendarDays: 0, hasGaps: false })
    expect(consecutiveRuns([])).toEqual([])
    expect(calendarScale([sparse[0]], 10, 100).x(0)).toBe(60)
  })
})
