import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { analyze, MOCK } from '../api.js'
import { toCsv } from '../csv.js'
import { pct } from '../status.js'
import { showNy, TZ } from '../time.js'
import { MAX_STEPS, SIMULATION_SETTINGS } from '../simulation.js'
import { createSimulationController, simulationMetadata } from '../simulation-controller.js'
import ZoneMonitoring from './ZoneMonitoring.jsx'
import IncidentReview from './IncidentReview.jsx'

function download(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function LiveSimulation({ active }) {
  const [controller] = useState(() => createSimulationController({
    analyze: (request, options) => analyze(request, undefined, options),
  }))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [seed, setSeed] = useState('5300')
  const [view, setView] = useState('chart')
  const [focus, setFocus] = useState({ zone: '', date: '' })
  const [selection, setSelection] = useState({ zone: '', date: '' })
  const sectionRef = useRef(null)
  const focusTarget = useRef(null)
  const controls = useRef(null)
  useEffect(() => {
    controller.setActive(active && !MOCK)
    return () => controller.setActive(false)
  }, [controller, active])

  useEffect(() => {
    if (!focusTarget.current) return
    const node = sectionRef.current?.querySelector(`[data-focus-target="${focusTarget.current}"]`)
      ?? sectionRef.current?.querySelector('[data-focus-target="chart"]')
    focusTarget.current = null
    node?.focus()
  }, [view])

  const { session, result, busy, running, error } = state
  const disabled = MOCK || !active
  const finished = session?.step >= MAX_STEPS
  const unavailable = disabled || busy || !session
  const status = busy ? 'Waiting for real API' : finished ? 'Complete' : running ? 'Playing' : 'Paused'
  const scope = (c) => `${c.usable_rows} usable / ${c.excluded_rows} excluded of ${c.total_rows}`
  async function reset() {
    const ok = await controller.reset(seed.trim() === '' ? NaN : Number(seed))
    if (ok) { setView('chart'); setFocus({ zone: '', date: '' }); setSelection({ zone: '', date: '' }) }
  }
  function showIncidents(zone = '', date = '') {
    controller.pause()
    focusTarget.current = 'incidents'
    setSelection((current) => ({ zone: zone || current.zone, date: date || current.date }))
    setFocus({ zone, date }); setView('incidents')
  }

  function backToChart() { focusTarget.current = 'incident-link'; setView('chart') }
  function changeFocus(next) {
    setFocus(next)
    setSelection((current) => ({ zone: next.zone || current.zone, date: next.date }))
  }

  return (
    <section ref={sectionRef} className="live-simulation" aria-label="Live synthetic simulation">
      <div className="simulation-banner" role="note">
        <strong>SYNTHETIC SIMULATION — SIMULATED CLOCK</strong>
        <span>Invented completed responses for demonstration. This is not a live ambulance feed.</span>
      </div>
      <section className="panel" ref={controls}>
        <h2>Live Simulation</h2>
        <p>Load 20 fixed baseline days for zones A and B, then append 50 responses per six-hour step.
          The clock advances through September 2026 in {TZ}. Up to {MAX_STEPS} steps and 6,000 records.</p>
        <p className="muted">This session is separate from your imported records. Rates, limits and signals come
          from the real API. The current simulated day stays provisional until its midnight has passed.</p>
        {MOCK && <p className="error" role="alert">Simulation is disabled in MOCK mode. Start the real application to use it.</p>}

        <div className="simulation-controls">
          <label>Seed for load/reset
            <input type="number" min="0" max="4294967295" step="1" value={seed}
              disabled={disabled} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <label>Future records
            <select value={state.scenario} disabled={disabled} onChange={(e) => controller.setScenario(e.target.value)}>
              <option value="normal">Normal conditions</option>
              <option value="zone_shift">Zone A slower</option>
            </select>
          </label>
          <label>Pause between completed updates
            <select value={state.delay} disabled={disabled} onChange={(e) => controller.setDelay(Number(e.target.value))}>
              <option value="500">Fast — 0.5 seconds</option>
              <option value="1500">Normal — 1.5 seconds</option>
              <option value="3000">Slow — 3 seconds</option>
            </select>
          </label>
        </div>
        <div className="row">
          <button className="primary" disabled={disabled} onClick={reset}>{session ? 'Reset simulation' : 'Load baseline'}</button>
          <button disabled={unavailable || running || finished} onClick={() => controller.start()}>Start</button>
          <button disabled={disabled || !running} onClick={() => controller.pause()}>Pause</button>
          <button disabled={unavailable || running || finished} onClick={() => controller.advance()}>Advance 6 hours</button>
          <button disabled={unavailable} onClick={() => download(`SYN-simulation-${session.seed}-step-${session.step}.csv`, toCsv(session.records), 'text/csv;charset=utf-8')}>Export simulation CSV</button>
          <button disabled={unavailable} onClick={() => download(`SYN-simulation-${session.seed}-step-${session.step}.json`, JSON.stringify(simulationMetadata(state), null, 2) + '\n', 'application/json')}>Export replay settings</button>
        </div>
        <p className="muted">A scenario switch affects the next requested batch only. Earlier records and the baseline
          stay fixed. Reset loads the chosen seed with no baseline confirmations. Playback pauses when you leave this tab.</p>
        <p className="muted">Pause playback before confirming baselines in the chart below. Confirmations are your
          review decision; this demonstration does not establish independence or operational stability.</p>
        <p className="simulation-state" role="status">{status}{session ? ` · step ${session.step} / ${MAX_STEPS} · displayed seed ${session.seed}` : ' · load a baseline to begin'}</p>
        {busy && <p className="notice">Analysis pending. {result ? 'Charts still show the last successful snapshot; new records and review changes are not committed yet.' : 'The baseline will appear after the API responds.'}</p>}
        {error && <div className="error" role="alert">{error} Playback is paused. {result ? 'The last successful snapshot is retained; no new records or review changes were committed.' : 'No successful simulation result is available yet.'} Retry the action or reset.</div>}
        {finished && <p className="notice">Run complete: ten monitoring days. Export this session or reset to replay.</p>}
      </section>

      <dl className="context simulation-context">
        <div><dt>Clock</dt><dd>SIMULATED · {TZ}</dd></div>
        <div><dt>Successful analysis as of</dt><dd>{result ? showNy(result.meta.as_of) : 'not run'}</dd></div>
        <div><dt>Fixed baseline cutoff</dt><dd>{showNy(SIMULATION_SETTINGS.baseline_end)}</dd></div>
        <div><dt>Target / priority</dt><dd>{SIMULATION_SETTINGS.target_minutes} min / {SIMULATION_SETTINGS.selected_priority}</dd></div>
        <div><dt>Selected priority rows</dt><dd>{result ? `${scope(result.quality.selected_priority)} (${pct(result.quality.selected_priority.usable_fraction)} usable)` : '—'}</dd></div>
        <div><dt>All simulation rows</dt><dd>{result ? scope(result.quality.overall) : '—'}</dd></div>
        <div><dt>Analysis source</dt><dd>{result ? 'Real API · synthetic records' : 'Real API required'}</dd></div>
      </dl>

      {result && <>
        <div className="row">
          <button disabled={view === 'chart'} onClick={backToChart}>Simulation chart</button>
          <button disabled={view === 'incidents'} onClick={() => showIncidents()}>Simulation incidents</button>
        </div>
        {view === 'chart' ? <ZoneMonitoring res={result} busy={busy || running} source={`Synthetic simulation · seed ${session.seed} · SIMULATED clock`} backLabel="↑ Simulation controls"
          selection={selection} onSelectionChange={setSelection}
          onToggleReviewed={(zone) => controller.review(zone)} onViewIncidents={showIncidents}
          onBack={() => controls.current?.scrollIntoView({ block: 'start' })} />
          : <IncidentReview res={result} focus={focus} onFocus={changeFocus} onBack={backToChart} />}
      </>}
    </section>
  )
}
