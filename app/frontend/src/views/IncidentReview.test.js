import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import IncidentReview from './IncidentReview.jsx'

const coverage = { total_rows: 1, usable_rows: 1, excluded_rows: 0 }
const res = {
  meta: { target_minutes: 10, selected_priority: 'P1' },
  zone_baselines: [{ zone: 'A' }, { zone: 'B' }],
  late_incidents: [{ zone: 'A', date: '2026-09-22', row_number: 2, incident_id: '0001',
    dispatched_at: '2026-09-22T10:00:00-04:00', on_scene_at: '2026-09-22T10:15:00-04:00',
    response_minutes: 15, phase: 'monitoring' }],
  quality: { selected_priority: coverage, overall: coverage, unassigned_priority_rows: 0, reasons: [] },
  excluded_records: [],
}

describe('review date remains explicit when switching to a zone without late cases', () => {
  it('keeps the chosen date and empty zone in the selectable options and shows zero cases', () => {
    const html = renderToStaticMarkup(createElement(IncidentReview, {
      res, focus: { zone: 'B', date: '2026-09-22' }, onFocus() {}, onBack() {},
    }))
    expect(html).toContain('<option value="B" selected="">B</option>')
    expect(html).toContain('<option value="2026-09-22" selected="">2026-09-22</option>')
    expect(html).toContain('<b>0</b> late response(s) shown.')
    expect(html).toContain('The selected date has been kept.')
    expect(html).toContain('data-focus-target="incidents"')
  })
})
