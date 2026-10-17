import { useEffect, useMemo, useRef, useState } from 'react'
import { COLUMNS, extraColumns, toCsv } from '../csv.js'
import { pct, reasonText, reasonsText } from '../status.js'
import { nyLocalToIso, showNy } from '../time.js'
import { EXAMPLES } from '../examples.js'

const PREVIEW_ROWS = 100
const EMPTY_FORM = { incident_id: '', zone: '', priority: '', dispatched_at: '', on_scene_at: '' }

export default function DataSettings({ records, source, settings, res, busy, onRecords, onSettings, onRun, onShowChart, onLoadExample, onInputIntent, onImportFile, onExportSession }) {
  const [form, setForm] = useState(null)
  const [over, setOver] = useState(false)
  const [example, setExample] = useState('zone_shift')
  const fileRef = useRef(null)

  const extras = useMemo(() => extraColumns(records), [records])
  const priorities = useMemo(() => [...new Set(records.map((r) => r.priority).filter(Boolean))].sort(), [records])
  const excludedByRow = useMemo(
    () => new Map((res?.excluded_records ?? []).map((e) => [e.row_number, e.reasons])),
    [res]
  )

  // Leaving this view invalidates a pending read before it can replace records.
  useEffect(() => () => onInputIntent(), [onInputIntent])

  function chooseFile() {
    onInputIntent()
    fileRef.current?.click()
  }

  function startForm() {
    onInputIntent()
    setForm({ ...EMPTY_FORM, priority: settings.selected_priority })
  }

  function changeForm(patch) {
    onInputIntent()
    setForm((current) => ({ ...current, ...patch }))
  }

  function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    onImportFile(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setOver(false)
    onImportFile(e.dataTransfer.files?.[0])
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(records)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'responses.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function saveForm(e) {
    e.preventDefault()
    const rec = {
      ...form,
      dispatched_at: nyLocalToIso(form.dispatched_at),
      on_scene_at: nyLocalToIso(form.on_scene_at),
    }
    onRecords([...records, rec], source ? `${source} + manual entries` : 'manual entries')
    if (!settings.selected_priority) onSettings({ selected_priority: rec.priority })
    setForm(null)
  }

  // Display-only tallies of items the API returned (no statistics computed here).
  const high = res ? res.signals.filter((s) => s.status === 'high').length : 0
  const low = res ? res.signals.filter((s) => s.status === 'low').length : 0
  const waiting = res ? res.daily_points.filter((p) => !['high', 'low', 'no_signal'].includes(p.status)).length : 0

  return (
    <>
      <section className="hero">
        <div className="kicker">Daily p chart · dispatch supervisors</div>
        <h1>Spot the zones where late arrivals are rising</h1>
        <p className="tag">
          Load a completed-response log, pick a priority and a baseline period, and the server compares each zone&rsquo;s
          daily share of late arrivals with that zone&rsquo;s own baseline. Days that cross the control limits are
          listed for review, down to the individual incidents.
        </p>
        <div className="how">
          <div><b><span className="ic">📄</span>1 · Load records</b><p>A CSV with five columns from the dispatch log.</p></div>
          <div><b><span className="ic">⚙️</span>2 · Run the analysis</b><p>Choose priority, target and baseline end.</p></div>
          <div><b><span className="ic">📈</span>3 · Review zones</b><p>Confirm each baseline, then read the signals and incidents.</p></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><span className="pn">1</span><h2>Records</h2>
          <span className="aside">kept in this browser tab only</span></div>

        <div className="row">
          <label className="inline">
            Try an example
            <select value={example} onChange={(e) => { onInputIntent(); setExample(e.target.value) }} aria-label="Example dataset">
              {Object.entries(EXAMPLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <button className="primary" onClick={() => onLoadExample(example)}>
            {busy ? 'Load selected example' : 'Load & analyse example'}
          </button>
          <span className="muted">or use your own file below</span>
        </div>

        <div
          className={over ? 'drop over' : 'drop'}
          onClick={chooseFile}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseFile() } }}
        >
          <div className="big-ic" aria-hidden="true">⬆️</div>
          <b>Drop a CSV or analysis JSON here, or click to choose a file</b>
          <span className="muted">
            Columns <code>{COLUMNS.join(', ')}</code>; times with a UTC offset, e.g. <code>2026-09-21T08:15:00-04:00</code>.
            Importing replaces the current session. Analysis JSON restores saved settings and baseline confirmations, then recalculates the results.
          </span>
          <input ref={fileRef} type="file" accept=".csv,text/csv,.json,application/json" onChange={onPick} onClick={(e) => e.stopPropagation()} hidden />
        </div>

        <div className="row">
          <button onClick={chooseFile}>Import CSV / analysis JSON</button>
          <button onClick={startForm} disabled={!!form}>
            Add completed response
          </button>
          <button onClick={exportCsv} disabled={records.length === 0}>Export CSV (records only)</button>
          <button onClick={onExportSession} disabled={!res || busy}>Export analysis JSON</button>
        </div>
        <div className={records.length ? 'loaded' : 'muted'}>
          {records.length > 0 && <span aria-hidden="true">✅</span>}
          <span>
            {records.length ? `${records.length} rows from ${source}` : 'No records loaded.'}
            {extras.length > 0 && ` · extra column(s) kept for export, not analysed: ${extras.join(', ')}`}
          </span>
        </div>

        {form && (
          <form className="entry" onSubmit={saveForm}>
            <h3>Add completed response</h3>
            <p className="muted">Times are New York local time; the offset is added for you.</p>
            {['incident_id', 'zone', 'priority'].map((k) => (
              <label key={k}>
                {k}
                <input required value={form[k]} onChange={(e) => changeForm({ [k]: e.target.value })} />
              </label>
            ))}
            {['dispatched_at', 'on_scene_at'].map((k) => (
              <label key={k}>
                {k}
                <input type="datetime-local" step="1" required value={form[k]}
                  onChange={(e) => changeForm({ [k]: e.target.value })} />
              </label>
            ))}
            <div className="row">
              <button type="submit" className="primary">Save</button>
              <button type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><span className="pn">2</span><h2>Settings</h2>
          <span className="aside">all times New York</span></div>
        <div className="settings">
          <label>
            Priority to analyse
            <select value={settings.selected_priority} onChange={(e) => onSettings({ selected_priority: e.target.value })}>
              <option value="">— choose —</option>
              {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <small>One category at a time; each zone gets its own baseline.</small>
          </label>
          <label>
            Target (minutes)
            <input type="number" min="0" step="any" value={settings.target_minutes}
              onChange={(e) => onSettings({ target_minutes: e.target.value })} />
            <small>Late = response time strictly above this. 10 is a demo value, not a clinical standard.</small>
          </label>
          <label>
            Baseline ends at the start of
            <input type="date" value={settings.baseline_end} onChange={(e) => onSettings({ baseline_end: e.target.value })} />
            <small>New York midnight; dispatches from this moment on are monitoring days.</small>
          </label>
          <label>
            Analysis time (optional)
            <input type="datetime-local" step="1" value={settings.as_of} onChange={(e) => onSettings({ as_of: e.target.value })} />
            <small>Leave blank for the server&rsquo;s current time. A historical time is for demos and tests.</small>
          </label>
        </div>
        <div className="row">
          <button className="primary big" onClick={onRun} disabled={busy}>{busy ? 'Running…' : 'Run analysis'}</button>
          {!res && records.length > 0 && <span className="muted">No current result: run the analysis after any change.</span>}
        </div>

        {res && res.quality.reasons.length === 0 && (
          <div className="callout ok">
            <b>Analysis ready.</b> Next, open the zone chart and confirm each baseline before reading verdicts.
            <div className="kpis">
              <div className="kpi"><div className="k">Zones</div><div className="v">{res.zone_baselines.length}</div></div>
              <div className="kpi"><div className="k">Monitoring days</div><div className="v">{res.daily_points.length}</div><div className="s">zone × day</div></div>
              <div className="kpi"><div className="k">High signals</div><div className={high ? 'v critical' : 'v'}>{high}</div></div>
              <div className="kpi"><div className="k">Low signals</div><div className="v">{low}</div></div>
              <div className="kpi"><div className="k">No verdict yet</div><div className="v">{waiting}</div><div className="s">unreviewed, insufficient or today</div></div>
              <div className="kpi"><div className="k">Usable rows</div><div className="v">{pct(res.quality.selected_priority.usable_fraction)}</div><div className="s">of this priority</div></div>
            </div>
            <div className="row"><button className="primary" onClick={onShowChart}>View zone chart →</button></div>
          </div>
        )}
        {res?.quality.reasons.length > 0 && (
          <p className="notice">{res.quality.reasons.map(reasonText).join(' ')} There is no result to chart; no rate is shown as zero.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><span className="pn">3</span><h2>Record preview</h2>
          {records.length > 0 && <span className="aside">first {Math.min(PREVIEW_ROWS, records.length)} of {records.length}</span>}</div>
        {res && (
          <p className="muted">
            Rows the server excluded show the reason. Excluded rows are left out of every count, rate and limit.
          </p>
        )}
        {records.length === 0 ? (
          <p className="muted">Nothing to show yet.</p>
        ) : (
          <div className="scroll tall">
            <table>
              <thead>
                <tr><th>#</th>{COLUMNS.map((c) => <th key={c}>{c}</th>)}<th>Excluded because</th></tr>
              </thead>
              <tbody>
                {records.slice(0, PREVIEW_ROWS).map((r, i) => {
                  const reasons = excludedByRow.get(i + 1)
                  return (
                    <tr key={i} className={reasons ? 'excluded' : ''}>
                      <td>{i + 1}</td>
                      <td>{r.incident_id}</td>
                      <td>{r.zone}</td>
                      <td>{r.priority}</td>
                      <td title={r.dispatched_at}>{r.dispatched_at ? showNy(r.dispatched_at) : <em>missing</em>}</td>
                      <td title={r.on_scene_at}>{r.on_scene_at ? showNy(r.on_scene_at) : <em>missing</em>}</td>
                      <td>{reasons ? reasonsText(reasons) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {res && res.excluded_records.length > 0 && (
          <details>
            <summary>All {res.excluded_records.length} excluded rows (all priorities)</summary>
            <ExcludedList items={res.excluded_records} />
          </details>
        )}
      </section>
    </>
  )
}

export function ExcludedList({ items }) {
  return (
    <ul className="excluded-list">
      {items.map((e, i) => (
        <li key={i}>
          Row {e.row_number} ({e.incident_id ?? 'no valid id'}, zone {e.zone ?? '?'}, {e.priority ?? 'no priority'}): {reasonsText(e.reasons)}
        </li>
      ))}
    </ul>
  )
}
