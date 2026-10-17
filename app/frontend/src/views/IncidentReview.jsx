import { useMemo, useState } from 'react'
import { showNy } from '../time.js'
import { ExcludedList } from './DataSettings.jsx'
import { reasonText } from '../status.js'

const FIRST_ROWS = 300

const SORTS = {
  minutes: (a, b) => b.response_minutes - a.response_minutes,
  time: (a, b) => Date.parse(a.dispatched_at) - Date.parse(b.dispatched_at),
  zone: (a, b) => a.zone.localeCompare(b.zone) || Date.parse(a.dispatched_at) - Date.parse(b.dispatched_at),
  id: (a, b) => a.incident_id.localeCompare(b.incident_id),
}

export default function IncidentReview({ res, focus, onFocus, onBack }) {
  const [sortBy, setSortBy] = useState('minutes')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const incidents = res?.late_incidents ?? []
  const zones = useMemo(() => [...new Set([...(res?.zone_baselines ?? []).map((b) => b.zone), ...incidents.map((i) => i.zone), focus.zone].filter(Boolean))].sort(), [res, incidents, focus.zone])
  const dates = useMemo(
    () => [...new Set([...incidents.filter((i) => !focus.zone || i.zone === focus.zone).map((i) => i.date), focus.date].filter(Boolean))].sort(),
    [incidents, focus.zone, focus.date]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const kept = incidents.filter((i) =>
      (!focus.zone || i.zone === focus.zone) && (!focus.date || i.date === focus.date)
      && (!q || i.incident_id.toLowerCase().includes(q)))
    return [...kept].sort(SORTS[sortBy])
  }, [incidents, focus, sortBy, query])

  if (!res) {
    return (
      <section className="panel">
        <p>No current analysis. Run it on the Data &amp; Settings page.</p>
      </section>
    )
  }

  const target = res.meta.target_minutes
  const sel = res.quality.selected_priority
  const all = res.quality.overall
  // display scale for the bars only: the longest response among the rows shown
  const scale = Math.max(target, ...rows.map((i) => i.response_minutes))
  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS)
  const head = (key, label) => (
    <button className="sort" onClick={() => setSortBy(key)} aria-pressed={sortBy === key}>
      {label}{sortBy === key ? ' ▾' : ''}
    </button>
  )

  return (
    <>
      <section className="panel">
        <div className="panel-head"><span className="pn">3</span><h2 tabIndex={-1} data-focus-target="incidents">Late completed responses</h2>
          <span className="aside">target {target} min · priority {res.meta.selected_priority}</span></div>
        <p className="muted">
          Responses that took longer than the {target}-minute target, from both the baseline and monitoring periods.
          A late response is a case to review, not by itself a statistical signal. Only usable records appear here.
        </p>
        <div className="row">
          <label className="inline">
            Zone
            <select value={focus.zone} onChange={(e) => onFocus({ ...focus, zone: e.target.value })}>
              <option value="">All zones</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label className="inline">
            Date
            <select value={focus.date} onChange={(e) => onFocus({ ...focus, date: e.target.value })}>
              <option value="">All dates</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="inline">
            Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="minutes">Response minutes (longest first)</option>
              <option value="time">Dispatch time</option>
              <option value="zone">Zone</option>
              <option value="id">Incident ID</option>
            </select>
          </label>
          <input className="search" type="search" placeholder="Search incident ID…" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Search incident ID" />
          <button onClick={() => { onFocus({ zone: '', date: '' }); setQuery('') }}>Clear filters</button>
          <button onClick={onBack}>← Back to chart</button>
        </div>

        <p aria-live="polite"><b>{rows.length}</b> late response(s) shown.</p>
        {rows.length === 0 && <p className="notice">No late responses match the current zone, date and search filters. The selected date has been kept.</p>}
        {rows.length > 0 && (
          <div className="scroll tall">
            <table>
              <thead>
                <tr>
                  <th>Row</th><th>{head('id', 'Incident')}</th><th>{head('zone', 'Zone')}</th><th>Date</th><th>Period</th>
                  <th>{head('time', 'Dispatched')}</th><th>On scene</th><th style={{ textAlign: 'right' }}>{head('minutes', 'Response (min)')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.row_number}>
                    <td>{i.row_number}</td><td>{i.incident_id}</td><td>{i.zone}</td><td>{i.date}</td><td>{i.phase}</td>
                    <td>{showNy(i.dispatched_at)}</td><td>{showNy(i.on_scene_at)}</td>
                    <td className="num">
                      <span className="minbar" title={`${i.response_minutes.toFixed(2)} min; target ${target} min`}>
                        <span className="track" aria-hidden="true">
                          <span className="fill" style={{ width: `${(i.response_minutes / scale) * 100}%` }} />
                          <span className="tgt" style={{ left: `${(target / scale) * 100}%` }} />
                        </span>
                        {i.response_minutes.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > FIRST_ROWS && (
          <div className="row">
            <span className="muted">Showing {shown.length} of {rows.length}.</span>
            <button onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${rows.length}`}</button>
          </div>
        )}
        <p className="muted">Bars: response time on a common scale; the black tick marks the {target}-minute target.</p>
      </section>

      <section className="panel">
        <h2>Record coverage</h2>
        <p>
          {`Selected priority: ${sel.usable_rows} usable and ${sel.excluded_rows} excluded of ${sel.total_rows} rows. All imported rows: ${all.usable_rows} usable and ${all.excluded_rows} excluded of ${all.total_rows}.`}
          {res.quality.unassigned_priority_rows > 0 && ` ${res.quality.unassigned_priority_rows} row(s) had no valid priority.`}
        </p>
        <p className="callout tip">
          This page only knows about responses that were logged with both timestamps. Missing or incorrect logs can
          bias the late rate, and cancelled or still-open calls are not included.
        </p>
        {res.quality.reasons.length > 0 && <p className="notice">{res.quality.reasons.map(reasonText).join(' ')}</p>}
        {res.excluded_records.length > 0 && (
          <details>
            <summary>{res.excluded_records.length} excluded row(s), all priorities, and why</summary>
            <ExcludedList items={res.excluded_records} />
          </details>
        )}
      </section>
    </>
  )
}
