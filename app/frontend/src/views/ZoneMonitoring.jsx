import { useEffect, useMemo, useState } from 'react'
import PChart, { shortDate } from '../components/PChart.jsx'
import { BASELINE_STATUS, pct, reasonText, reasonsText, statusInfo } from '../status.js'
import { showNy } from '../time.js'
import { calendarScale, consecutiveRuns, observedSpan } from '../chart-dates.js'

// Everything on this page is a value the API returned (interfaces v1.0) or a
// count/filter/sort of the API's own items. `period` and the 'baseline'
// status are display-only labels. No counts, rates or limits are computed.

function chartRows(base, monitoring, withBaseline) {
  const baseRows = withBaseline
    ? (base?.daily ?? []).map((d) => ({ ...d, period: 'baseline', status: 'baseline', lower: null, upper: null, reasons: [] }))
    : []
  return [...baseRows, ...monitoring.map((p) => ({ ...p, period: 'monitoring' }))]
}

const cellClass = (s) => (s === 'high' ? 'hi' : s === 'low' ? 'lo' : s === 'no_signal' ? 'ok' : 'na')

export default function ZoneMonitoring({ res, busy, source, onToggleReviewed, onConfirmAll, onViewIncidents, onBack, backLabel = '← Back to data', selection, onSelectionChange }) {
  const zones = useMemo(() => (res ? res.zone_baselines.map((b) => b.zone) : []), [res])
  const [localSelection, setLocalSelection] = useState({ zone: '', date: '' })
  const { zone: picked, date: focusDate } = selection ?? localSelection
  const [withBaseline, setWithBaseline] = useState(false)
  const zone = zones.includes(picked) ? picked : zones[0] ?? ''
  const defaultDay = res
    ? [...res.signals.filter((s) => s.zone === zone)].sort((a, b) => b.rate - a.rate)[0]?.date
      ?? [...res.daily_points.filter((p) => p.zone === zone)].reverse().find((p) => p.late > 0)?.date
    : undefined
  const day = focusDate || defaultDay

  // Tell the parent which default is actually displayed, so navigating away
  // or exporting a session preserves it. Never replace an explicit date.
  useEffect(() => {
    if (selection != null && zone && (picked !== zone || focusDate !== (day ?? ''))) {
      onSelectionChange?.({ zone, date: day ?? '' })
    }
  }, [selection, picked, focusDate, zone, day, onSelectionChange])

  if (!res) {
    return (
      <section className="panel">
        <p>No current analysis. Load records and run it on the Data &amp; Settings page.</p>
        <button onClick={onBack}>{backLabel}</button>
      </section>
    )
  }
  if (zones.length === 0) {
    return (
      <section className="panel">
        <p className="notice">
          {res.quality.reasons.map(reasonText).join(' ') || 'No zones to show.'} Nothing is charted, and no rate is shown as zero.
        </p>
        <button onClick={onBack}>{backLabel}</button>
      </section>
    )
  }

  const pr = res.meta.selected_priority
  const target = res.meta.target_minutes
  const pointsOf = (z) => res.daily_points.filter((p) => p.zone === z)
  const signalsOf = (z) => res.signals.filter((s) => s.zone === z)
  const base = res.zone_baselines.find((b) => b.zone === zone)
  const monitoring = pointsOf(zone)
  const rows = chartRows(base, monitoring, withBaseline)
  const canReview = base.status === 'ready' || base.status === 'unreviewed_baseline'
  const pending = res.daily_points.filter((p) => !statusInfo(p.status).formal)
  const needReview = res.zone_baselines.filter((b) => b.status === 'unreviewed_baseline').map((b) => b.zone)

  // headline: the zone with the most high-signal days (a count of API items)
  const highCount = (z) => signalsOf(z).filter((s) => s.status === 'high').length
  const lowCount = (z) => signalsOf(z).filter((s) => s.status === 'low').length
  const lead = [...zones].sort((a, b) => highCount(b) - highCount(a))[0]
  const monDates = [...new Set(res.daily_points.map((p) => p.date))].sort()
  const monSpan = observedSpan(res.daily_points)
  const baseDates = res.zone_baselines.flatMap((b) => b.daily.map((d) => d.date)).sort()
  const baseSpan = baseDates.length ? `${shortDate(baseDates[0])}–${shortDate(baseDates[baseDates.length - 1])}` : 'baseline'
  let title
  if (highCount(lead) > 0) title = `${lead} is running late more often than its own baseline`
  else if (zones.some((z) => lowCount(z) > 0)) title = `${zones.find((z) => lowCount(z) > 0)} is running late less often than its own baseline`
  else if (needReview.length) title = 'Review each baseline to unlock verdicts'
  else if (!res.daily_points.some((p) => statusInfo(p.status).formal)) title = 'No completed-day verdicts yet'
  else title = 'No formal control-chart signals'

  // the day shown in the "slowest arrivals" panel
  // Keep an explicitly chosen date even when the newly selected zone has no
  // observation on it; silently jumping to its peak day changes the question.
  const dayPoint = monitoring.find((p) => p.date === day)
  const slowest = res.late_incidents
    .filter((i) => i.zone === zone && i.date === day)
    .sort((a, b) => b.response_minutes - a.response_minutes)
    .slice(0, 5)
  const scale = Math.max(target * 2, ...slowest.map((i) => i.response_minutes))
  const feed = [...res.signals].sort((a, b) => b.date.localeCompare(a.date) || a.zone.localeCompare(b.zone))

  const pick = (z, date = day ?? '') => {
    const next = { zone: z, date }
    if (selection == null) setLocalSelection(next)
    onSelectionChange?.(next)
  }

  return (
    <>
      <section className="headline">
        <div>
          <div className="kick">{res.signals.length} signal{res.signals.length === 1 ? '' : 's'} · {monDates.length} observed monitoring dates{monSpan.start && ` · ${shortDate(monSpan.start)}–${shortDate(monSpan.end)} (${monSpan.calendarDays} calendar days)`}</div>
          <h1>{title}</h1>
          <p>
            Priority {pr} calls, dispatch to first unit on scene, late if over {target} minutes. Each zone is compared
            with its own {baseSpan} baseline, not with the other zones.
          </p>
        </div>
        <div className="tiles">
          <div className="tile"><div className="label">Calls analysed</div><div className="v">{res.quality.selected_priority.usable_rows.toLocaleString('en-US')}</div></div>
          <div className="tile"><div className="label">Usable</div><div className="v">{pct(res.quality.selected_priority.usable_fraction, 0)}</div></div>
        </div>
      </section>

      {needReview.length > 0 && (
        <p className="callout warn">
          <b>Baseline review needed:</b> {needReview.join(', ')}. Until a zone&rsquo;s baseline is confirmed, its days
          show &ldquo;Baseline not reviewed&rdquo; instead of a verdict. Check each baseline in the panel below.
          {onConfirmAll && (
            <> Or <button className="primary" disabled={busy} onClick={onConfirmAll}>Confirm all usable baselines</button>.</>
          )}
        </p>
      )}

      <div className="zone-grid">
        {res.zone_baselines.map((b) => {
          const pts = pointsOf(b.zone)
          const hi = highCount(b.zone)
          const lo = lowCount(b.zone)
          const lastSig = [...signalsOf(b.zone)].sort((a, c) => c.date.localeCompare(a.date))[0]
          const tag = hi ? ['hi', `${hi} high day${hi > 1 ? 's' : ''}`]
            : lo ? ['lo', `${lo} low day${lo > 1 ? 's' : ''}`]
            : b.status === 'unreviewed_baseline' ? ['wait', 'needs review']
            : b.status === 'insufficient_data' || !pts.some((p) => statusInfo(p.status).formal) ? ['na', 'no verdicts']
            : ['ok', 'no formal signals']
          const rates = pts.map((p) => p.rate).filter((r) => r != null)
          const rMin = Math.min(...rates), rMax = Math.max(...rates)
          const { x: sx } = calendarScale(pts, 0, 100)
          const sy = (r) => (rMax === rMin ? 17 : 30 - ((r - rMin) / (rMax - rMin)) * 26)
          const sparkRuns = consecutiveRuns(pts)
          return (
            <button key={b.zone} className={b.zone === zone ? 'zcard on' : 'zcard'} onClick={() => pick(b.zone)} aria-pressed={b.zone === zone}>
              <span className="top"><span className="name">{b.zone}</span><span className={`ztag ${tag[0]}`}>{tag[1]}</span></span>
              <span className="metrics">
                <span className="metric"><span className="label">Baseline p̄</span><span className="v">{pct(b.p_bar)}</span>
                  <span className="s">{`${b.late.toLocaleString('en-US')} / ${b.n.toLocaleString('en-US')}`}</span></span>
                <span className="metric"><span className="label">Last signal</span>
                  <span className={lastSig ? 'v sig' : 'v'}>{lastSig ? shortDate(lastSig.date) : '—'}</span>
                  <span className="s">{lastSig ? `${pct(lastSig.rate)} vs ${lastSig.status === 'high' ? 'UCL ' + pct(lastSig.upper) : 'LCL ' + pct(lastSig.lower)}` : 'no formal signal'}</span></span>
                {rates.length > 1 ? (
                  <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
                    {sparkRuns.map((run) => run.length === 1
                      ? <circle key={run[0].index} data-spark-segment="point" cx={sx(run[0].index)} cy={sy(run[0].point.rate)} r="1.6" style={{ fill: 'var(--series)' }} />
                      : <polyline key={run[0].index} data-spark-segment="line" points={run.map(({ point, index }) => `${sx(index)},${sy(point.rate)}`).join(' ')} vectorEffect="non-scaling-stroke" />)}
                  </svg>
                ) : <span className="metric"><span className="label">Monitoring</span><span className="v">{pts.length}</span><span className="s">observed dates</span></span>}
              </span>
              {pts.length > 0 && (
                <>
                  <span className="strip-head label"><span>{shortDate(pts[0].date)}</span><span>1 cell = 1 observed date; gaps omitted</span><span>{shortDate(pts[pts.length - 1].date)}</span></span>
                  <span className="strip">
                    {pts.map((p) => (
                      <span key={p.date} className={`cell ${cellClass(p.status)}${b.zone === zone && p.date === day ? ' sel' : ''}`}
                        title={`${p.date}: ${pct(p.rate)} · ${statusInfo(p.status).label} (click to select)`}
                        onClick={(e) => { e.stopPropagation(); pick(b.zone, p.date) }} />
                    ))}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      <div className="two">
        <section className="panel">
          <div className="panel-head">
            <h2 data-focus-target="chart" tabIndex={-1}>{zone} · daily share of late arrivals (p chart)</h2>
            <span className="aside">limits widen and narrow with each day&rsquo;s call count</span>
          </div>
          <div className="row">
            <label className="inline">
              Zone
              <select name="zone" value={zone} onChange={(e) => pick(e.target.value)}>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
            <button onClick={onBack}>{backLabel}</button>
          </div>
          <PChart points={rows} pBar={base.p_bar} zone={zone} selected={day}
            onPick={(p) => pick(zone, p.date)}
            withBaseline={withBaseline} onToggleBaseline={() => setWithBaseline(!withBaseline)} />
          <p className="read">
            <b>How to read this:</b> each point is one day&rsquo;s share of priority-{pr} calls that took more than {target} minutes
            from dispatch to arrival. The shaded band is the range {zone}&rsquo;s baseline predicts for that day&rsquo;s call
            count; a point above it means {zone} was late more often than its own baseline explains, so review that day.
            The {target}-minute target defines &ldquo;late&rdquo;; the band is statistical.
          </p>
        </section>

        <section className="panel">
          <h2>Days to review</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: '.82rem' }}>Outside the control limits, newest first</p>
          {feed.length === 0 ? (
            <p>No formal signals. Check the status of each day below: days without a verdict are not &ldquo;normal&rdquo;.</p>
          ) : (
            <ul className="feed">
              {feed.map((s) => (
                <li key={`${s.zone}${s.date}`}>
                  <button data-signal className={s.zone === zone && s.date === day ? 'on' : ''} onClick={() => pick(s.zone, s.date)}>
                    <span>{`${s.zone} · ${shortDate(s.date)}`}</span>
                    <span className={s.status === 'low' ? 'r lo' : 'r'}>{pct(s.rate)}</span>
                    <span className="m">{`${s.late} / ${s.n} late`}</span>
                    <span className="m" style={{ textAlign: 'right' }}>{s.status === 'high' ? `UCL ${pct(s.upper)}` : `LCL ${pct(s.lower)}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pending.length > 0 && (
            <p className="muted" style={{ fontSize: '.82rem' }}>
              {pending.length} monitoring day(s) have no verdict (provisional, baseline not reviewed, or insufficient data).
            </p>
          )}
          <div className="row"><button className="link" onClick={() => onViewIncidents(zone, '')}>Review incidents →</button></div>
        </section>
      </div>

      {dayPoint && (
        <section className="panel">
          <div className="panel-head">
            <h2>{zone} · {shortDate(day)} · slowest late responses</h2>
            <span className="aside">{dayPoint.late} late of {dayPoint.n} · sorted by dispatch-to-scene minutes</span>
            <button data-focus-target="incident-link" className="link right" onClick={() => onViewIncidents(zone, day)}>Open all in Incident Review →</button>
          </div>
          {slowest.length === 0 ? (
            <p className="muted">No late responses on this day.</p>
          ) : (
            <div className="slow">
              <span className="h">Incident</span><span className="h t">Dispatched</span><span className="h">Minutes</span><span className="h">vs {target}-min target</span>
              {slowest.map((i) => (
                <FragmentRow key={i.row_number} i={i} scale={scale} target={target} />
              ))}
            </div>
          )}
        </section>
      )}

      {day && !dayPoint && (
        <section className="panel">
          <h2>{zone} · {shortDate(day)} · selected date</h2>
          <p className="muted">No monitoring observation for this zone on {day}. No rate or verdict is available for this date.</p>
          <button data-focus-target="incident-link" className="link" onClick={() => onViewIncidents(zone, day)}>Open all in Incident Review →</button>
        </section>
      )}

      <section className="panel" id="review">
        <div className="panel-head">
          <h2>Baseline for zone {zone}</h2>
          <span className={`chip ${base.status === 'ready' ? 'ok' : base.status === 'unreviewed_baseline' ? 'wait' : ''}`}>{BASELINE_STATUS[base.status] ?? base.status}</span>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="k">Baseline late rate p̄</div><div className="v">{pct(base.p_bar, 2)}</div></div>
          <div className="kpi"><div className="k">Late / completed</div><div className="v">{`${base.late} / ${base.n}`}</div></div>
          <div className="kpi"><div className="k">Days with responses</div><div className="v">{base.nonempty_days}</div><div className="s">20 needed</div></div>
        </div>
        {base.reasons.length > 0 && <p className="notice">{reasonsText(base.reasons)}</p>}
        <h3>Check before confirming</h3>
        <ul className="checklist">
          <li>Turn on &ldquo;baseline days&rdquo; in the chart: do the grey baseline points drift, or jump?</li>
          <li>Does any weekday in the table below stand out?</li>
          <li>Confirming records that you reviewed the baseline; it does not prove the days are independent or comparable.</li>
        </ul>
        <div className="scroll" style={{ marginTop: 10 }}>
          <table>
            <thead><tr><th>Weekday</th><th>Days</th><th>Late / completed</th><th>Late rate</th></tr></thead>
            <tbody>
              {base.weekday.map((w) => (
                <tr key={w.weekday}><td>{w.label}</td><td>{w.nonempty_days}</td><td>{`${w.late} / ${w.n}`}</td><td>{pct(w.rate)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="check">
          <input type="checkbox" checked={base.reviewed} disabled={busy || !canReview} onChange={() => onToggleReviewed(zone)} />
          <span>
            Baseline reviewed for zone {zone}
            {!canReview && <span className="muted"> (baseline not usable, nothing to confirm)</span>}
          </span>
        </label>
      </section>

      <section className="panel">
        <h2>Daily table, zone {zone}</h2>
        <div className="scroll tall">
          <table>
            <thead>
              <tr><th>Date</th><th>Period</th><th>n</th><th>Late</th><th>Rate</th><th>Lower</th><th>Upper</th><th>Status</th><th>Why</th><th></th></tr>
            </thead>
            <tbody>
              {chartRows(base, monitoring, true).map((p) => (
                <tr key={p.date} className={p.period}>
                  <td>{p.date}</td><td>{p.period}</td><td>{p.n}</td><td>{p.late}</td>
                  <td>{pct(p.rate)}</td><td>{pct(p.lower)}</td><td>{pct(p.upper)}</td>
                  <td>
                    <StatusBadge status={p.status} />
                    {p.status !== 'provisional_current_day' && p.reasons.includes('current_day_provisional') && (
                      <> <StatusBadge status="provisional_current_day" /></>
                    )}
                  </td>
                  <td className="muted">{reasonsText(p.reasons)}</td>
                  <td>{p.late > 0 && <button className="link" onClick={() => onViewIncidents(zone, p.date)}>Incidents</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {monitoring.length === 0 && <p className="muted">No monitoring days after the baseline end for this zone.</p>}
      </section>

      <p className="foot">
        Data: {source || 'imported CSV'} · priority {pr} · values computed by app/qc.py on the server. Limits are statistical
        (from each zone&rsquo;s own baseline), not the {target}-minute target.
      </p>
    </>
  )
}

function FragmentRow({ i, scale, target }) {
  return (
    <>
      <span>{i.incident_id}</span>
      <span className="t">{showNy(i.dispatched_at).split(', ').pop().replace(/ E[DS]T$/, '')}</span>
      <b>{i.response_minutes.toFixed(1)}</b>
      <span className="bar" title={`${i.response_minutes.toFixed(2)} min; target ${target} min`}>
        <span className="fill" style={{ width: `${(i.response_minutes / scale) * 100}%` }} />
        <span className="tgt" style={{ left: `${(target / scale) * 100}%` }} />
      </span>
    </>
  )
}

export function StatusBadge({ status }) {
  const info = statusInfo(status)
  return (
    <span className={`badge ${info.tone}`} title={info.help}>
      <span aria-hidden="true">{info.icon}</span> {info.label}
    </span>
  )
}
