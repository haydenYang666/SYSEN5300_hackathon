import { useEffect, useRef, useState } from 'react'
import { API_URL, MOCK, analyze, health, mockScenarios } from './api.js'
import { parseIncidents } from './csv.js'
import { DEFAULT_EXAMPLE, EXAMPLES } from './examples.js'
import { createRequestLifecycle } from './request-lifecycle.js'
import { createAnalysisSession } from './analysis-session.js'
import { UNKNOWN_SOURCE, provenanceText } from './provenance.js'
import { pct } from './status.js'
import { TZ, nyLocalToIso, nyMidnightIso, showNy } from './time.js'
import DataSettings from './views/DataSettings.jsx'
import ZoneMonitoring from './views/ZoneMonitoring.jsx'
import IncidentReview from './views/IncidentReview.jsx'
import LiveSimulation from './views/LiveSimulation.jsx'
import Docs from './views/Docs.jsx'
import About from './views/About.jsx'

const PAGES = [
  ['data', 'Data & Settings'],
  ['zones', 'Zone Monitoring'],
  ['incidents', 'Incident Review'],
  ['simulation', 'Live Simulation'],
  ['docs', 'Docs'],
  ['about', 'About'],
]

// Pages without the analysis context strip or error banner.
const STANDALONE = ['simulation', 'docs', 'about']

// ?page=docs (or any page key) opens that page directly, e.g. a link for judges.
function initialPage() {
  try {
    const want = new URLSearchParams(window.location.search).get('page')
    return PAGES.some(([key]) => key === want) ? want : 'data'
  } catch { return 'data' }
}

const DEFAULT_SETTINGS = { selected_priority: '', target_minutes: '10', baseline_end: '', as_of: '' }

export default function App() {
  const [page, setPage] = useState(initialPage)
  const [records, setRecords] = useState([])
  const [source, setSource] = useState('')
  const [provenance, setProvenance] = useState(UNKNOWN_SOURCE)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [result, setResult] = useState(null) // { res, serverClock }
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState([])
  const [focus, setFocus] = useState({ zone: '', date: '' })
  const [selection, setSelection] = useState({ zone: '', date: '' })
  const [api, setApi] = useState({ state: 'checking' })
  const [mock, setMock] = useState(null) // { scenarios, csv, picked }
  const errorRef = useRef(null)
  const mainRef = useRef(null)
  const focusTarget = useRef(null)
  const initialExample = useRef(undefined)
  const [requests] = useState(() => createRequestLifecycle({
    analyze,
    parseIncidents,
    onBusy: setBusy,
    onErrors: setErrors,
    onResult: setResult,
    onDataset: ({ records: next, source: label, settings: nextSettings, provenance: origin,
      selection: nextSelection, focus: nextFocus }) => {
      setRecords(next)
      setSource(label)
      setProvenance(origin ?? UNKNOWN_SOURCE)
      setSelection(nextSelection ?? { zone: '', date: '' })
      setFocus(nextFocus ?? { zone: '', date: '' })
      setResult(null)
      if (nextSettings) setSettings(nextSettings)
      else {
        const priorities = [...new Set(next.map((r) => r.priority).filter(Boolean))].sort()
        setSettings((current) => priorities.includes(current.selected_priority)
          ? current : { ...current, selected_priority: priorities[0] ?? '' })
      }
    },
    onNavigate: (operation) => setPage((current) => {
      if (!operation.isCurrent() || STANDALONE.includes(current)) return current
      focusTarget.current = 'chart'
      return 'zones'
    }),
  }))
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'auto' } catch { return 'auto' }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch { /* private mode: theme just isn't remembered */ }
  }, [theme])

  const cycleTheme = () => setTheme((t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'))

  useEffect(() => {
    if (errors.length) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [errors])

  // A page transition must leave keyboard users at the destination content.
  // Focus only after intentional navigation; analysis refreshes keep focus put.
  useEffect(() => {
    if (!focusTarget.current || !mainRef.current) return
    const target = focusTarget.current
    focusTarget.current = null
    const visible = (selector) => [...mainRef.current.querySelectorAll(selector)]
      .find((node) => !node.closest('[hidden]'))
    const node = visible(`[data-focus-target="${target}"]`)
      ?? visible('h1, h2') ?? mainRef.current
    if (!node.hasAttribute('tabindex') && node.tagName !== 'BUTTON') node.tabIndex = -1
    node.focus()
  }, [page])

  function navigate(next, target = 'page') {
    focusTarget.current = target
    setPage(next)
  }

  useEffect(() => {
    let active = true
    health()
      .then((h) => { if (active) setApi({ state: 'ok', mode: h.analysis_mode }) })
      .catch(() => { if (active) setApi({ state: 'down' }) })
    if (MOCK) mockScenarios().then((m) => { if (active) setMock({ ...m, picked: '' }) })
    return () => { active = false }
  }, [])

  // Any change to data or settings makes the old result stale: drop it, and
  // with it every baseline confirmation. A new Run analysis is required.
  const invalidate = () => { requests.cancel(); setResult(null) }
  const changeRecords = (next, label) => {
    setRecords(next)
    if (label !== undefined) setSource(label)
    setProvenance({ kind: 'mixed', label: 'Records edited in this browser' })
    invalidate()
  }
  const changeSettings = (patch) => { setSettings((s) => ({ ...s, ...patch })); invalidate() }

  // MOCK only: load a scenario's records and its fixed settings into the session.
  function pickScenario(name) {
    const sc = mock.scenarios[name]
    setMock({ ...mock, picked: name })
    if (!sc) return
    changeRecords(parseIncidents(mock.csv(name)), `MOCK scenario "${name}"`)
    setProvenance({ kind: 'mock', label: `MOCK scenario ${name}` })
    changeSettings({
      selected_priority: sc.settings.selected_priority,
      target_minutes: String(sc.settings.target_minutes),
      baseline_end: sc.settings.baseline_end.slice(0, 10),
      as_of: sc.settings.as_of.slice(0, 19), // already New York local time
    })
  }

  // ctx lets a freshly loaded example run before React state has updated
  function buildRequest(reviewedZones, asOf, ctx = { records, settings }) {
    const { records, settings } = ctx
    const problems = []
    const target = Number(settings.target_minutes)
    if (!settings.selected_priority) problems.push('Choose a priority.')
    if (!(target > 0) || !Number.isFinite(target)) problems.push('Target minutes must be a positive number.')
    if (!settings.baseline_end) problems.push('Choose the baseline end date.')
    if (problems.length) throw problems
    const req = {
      records,
      target_minutes: target,
      selected_priority: settings.selected_priority,
      baseline_end: nyMidnightIso(settings.baseline_end),
      reviewed_zones: reviewedZones,
    }
    const fixedAsOf = asOf ?? (settings.as_of ? nyLocalToIso(settings.as_of) : null)
    if (fixedAsOf) req.as_of = fixedAsOf
    return req
  }

  function run(reviewedZones = [], asOf) {
    return requests.runAnalysis({
      buildRequest: () => buildRequest(reviewedZones, asOf),
      serverClock: asOf ? !!result?.serverClock : undefined,
      mockScenario: mock?.picked,
    })
  }

  // The fetch, CSV parse and analysis share one operation, so none can outlive
  // a newer example, manual edit or file import.
  function loadExample(key, openDashboard = false) {
    const example = EXAMPLES[key]
    if (!example) return
    return requests.loadExample({
      example,
      buildRequest: (ctx) => buildRequest([], undefined, ctx),
      mockScenario: mock?.picked,
      openDashboard,
    })
  }

  // First visit: show something. StrictMode cleanup aborts its first setup;
  // the second setup restarts the same chosen example rather than suppressing it.
  useEffect(() => {
    if (!MOCK) {
      if (initialExample.current === undefined) {
        const want = new URLSearchParams(window.location.search).get('example')
        initialExample.current = want === 'none' ? null
          : EXAMPLES[want] ? want : DEFAULT_EXAMPLE
      }
      if (initialExample.current) loadExample(initialExample.current, true)
    }
    return () => requests.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One click for "I have reviewed every usable baseline"; same as_of, like toggleReviewed.
  function confirmAll() {
    const zones = result.res.zone_baselines
      .filter((b) => b.status === 'ready' || b.status === 'unreviewed_baseline').map((b) => b.zone)
    run(zones, result.res.meta.as_of)
  }

  // Confirming a zone's baseline re-runs the analysis at the SAME as_of, so
  // the only thing that changes is which zones may receive a verdict.
  function toggleReviewed(zone) {
    const current = result?.res.meta.reviewed_zones ?? []
    const next = current.includes(zone) ? current.filter((z) => z !== zone) : [...current, zone]
    run(next, result.res.meta.as_of)
  }

  function viewIncidents(zone, date) {
    setFocus({ zone, date })
    setSelection((current) => ({ zone: zone || current.zone, date: date || current.date }))
    navigate('incidents', 'incidents')
  }

  function changeFocus(next) {
    setFocus(next)
    setSelection((current) => ({ zone: next.zone || current.zone, date: next.date }))
  }

  function importFile(file) {
    return requests.importFile(file, {
      buildRequest: (session) => buildRequest(session.reviewedZones, session.asOf, session),
      mockScenario: mock?.picked,
    })
  }

  function exportSession() {
    try {
      const snapshot = createAnalysisSession({ records, source, provenance, settings, result, selection, focus })
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2) + '\n'], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = 'response-analysis.json'; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setErrors([`Could not export analysis: ${error.message}`])
    }
  }

  const res = result?.res ?? null
  const showMock = MOCK || res?.meta?.is_mock === true

  return (
    <div className="app">
      <nav className="nav" aria-label="Pages">
        <div className="nav-inner">
          <div className="brand">
            <span className="logo" aria-hidden="true">
              {/* stopwatch (response time) with a medical cross */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="13.5" r="8" stroke="currentColor" />
                <path d="M9.5 2.5h5M12 2.5v3M18.4 6.2l1.6-1.6" stroke="currentColor" />
                <path d="M12 9.6v7.8M8.1 13.5h7.8" strokeWidth="2.6" />
              </svg>
            </span>
            <div><b>EMS Response Monitor</b><span>Dispatch supervisor console</span></div>
          </div>
          <div className="tabs">
            {PAGES.map(([key, label]) => (
              <button key={key} className={page === key ? 'tab on' : 'tab'} onClick={() => navigate(key)}
                aria-current={page === key ? 'page' : undefined}>
                {label}
                {key === 'data' && res && <span className="done" aria-label="analysis ready">✓</span>}
              </button>
            ))}
          </div>
          <div className="pills">
            <span className={`pill ${MOCK ? 'down' : api.state}`}
              title={MOCK ? 'Mock mode: mock calculations' : api.state === 'ok' ? `API at ${API_URL}: ${api.mode === 'real' ? 'real calculations' : api.mode ?? 'unknown mode'}` : `API at ${API_URL}`}>
              <span className="dot" />
              {MOCK ? 'mock' : api.state === 'ok' ? `API · ${api.mode ?? 'unknown'}` : api.state === 'down' ? 'API down' : 'API …'}
            </span>
            {!STANDALONE.includes(page) && res && (
              <span className="pill" title={`Analysis as of ${asOfShort(res.meta.as_of)} (New York time)`}>as of {asOfShort(res.meta.as_of).slice(5)}</span>
            )}
            <button className="pill theme" onClick={cycleTheme} title={`Theme: ${theme}. Click to switch auto / light / dark`}
              aria-label={`Theme: ${theme}. Switch theme`}>
              {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
            </button>
          </div>
        </div>
      </nav>

      {showMock && (
        <div className="mock-banner" role="alert">
          <strong>MOCK DATA — not a live analysis.</strong>
          <span>
            {MOCK
              ? 'Precomputed core output for fixed synthetic scenarios; the API is not called and your edits are not analysed.'
              : 'The API reported is_mock = true.'}
          </span>
          {MOCK && mock && (
            <label>
              Scenario{' '}
              <select value={mock.picked} onChange={(e) => pickScenario(e.target.value)}>
                <option value="">— load a scenario —</option>
                {Object.entries(mock.scenarios).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="page">
        {!STANDALONE.includes(page) && <ContextBar result={result} settings={settings} records={records} source={source} provenance={provenance} />}

        {!STANDALONE.includes(page) && errors.length > 0 && (
          <div className="error" role="alert" ref={errorRef}>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <main ref={mainRef} tabIndex={-1}>
          {page === 'data' && (
            <DataSettings
              records={records} source={source} settings={settings} res={res} busy={busy}
              onRecords={changeRecords} onSettings={changeSettings} onRun={() => run([])}
              onInputIntent={requests.cancel} onImportFile={importFile} onExportSession={exportSession}
              onLoadExample={(k) => loadExample(k, true)}
              onShowChart={() => navigate('zones', 'chart')}
            />
          )}
          {page === 'zones' && (
            <ZoneMonitoring
              res={res} busy={busy} source={`${source} · ${provenanceText(provenance)}`} onToggleReviewed={toggleReviewed} onConfirmAll={confirmAll}
              selection={selection} onSelectionChange={setSelection}
              onViewIncidents={viewIncidents} onBack={() => navigate('data')}
            />
          )}
          {page === 'incidents' && (
            <IncidentReview res={res} focus={focus} onFocus={changeFocus} onBack={() => navigate('zones', 'incident-link')} />
          )}
          {page === 'docs' && <Docs onOpenExample={(k) => { setPage('data'); loadExample(k, true) }} onOpenAbout={() => setPage('about')} />}
          {page === 'about' && <About onOpenDocs={() => setPage('docs')} />}
          <div hidden={page !== 'simulation'}>
            <LiveSimulation active={page === 'simulation'} />
          </div>
        </main>
      </div>
    </div>
  )
}

/** "2026-10-02 00:00" in New York time, for the navbar pill. */
function asOfShort(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}

function ContextBar({ result, settings, records, source, provenance }) {
  const m = result?.res.meta
  const q = result?.res.quality
  const scope = (c) => `${c.usable_rows} usable / ${c.excluded_rows} excluded of ${c.total_rows}`
  const cutoff = m?.baseline_end?.slice(0, 10) ?? settings.baseline_end
  return (
    <dl className="context">
      <div><dt>Dataset</dt><dd>{records.length ? source : 'none loaded'}</dd></div>
      {records.length > 0 && <div><dt>Data origin</dt><dd>{provenanceText(provenance)}</dd></div>}
      <div><dt>Priority</dt><dd>{m?.selected_priority ?? (settings.selected_priority || '—')}</dd></div>
      <div><dt>Late if</dt><dd>{`> ${m?.target_minutes ?? settings.target_minutes} min`}</dd></div>
      <div><dt>Baseline</dt><dd>{cutoff ? `before ${cutoff}` : '—'}</dd></div>
      <div><dt>Time zone</dt><dd>{TZ}</dd></div>
      <div>
        <dt>Analysis as of</dt>
        <dd>{m ? `${showNy(m.as_of)}${result.serverClock ? ' (server clock)' : ''}` : 'not run'}</dd>
      </div>
      <div>
        <dt>Selected priority rows</dt>
        <dd>{q ? `${scope(q.selected_priority)} (${pct(q.selected_priority.usable_fraction)} usable)` : `${records.length} rows loaded, not analysed`}</dd>
      </div>
      <div>
        <dt>All imported rows</dt>
        <dd>{q ? `${scope(q.overall)} (${pct(q.overall.usable_fraction)} usable)` : '—'}</dd>
      </div>
    </dl>
  )
}
