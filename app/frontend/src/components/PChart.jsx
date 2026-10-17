import { useRef, useState } from 'react'
import { pct, reasonsText, statusInfo } from '../status.js'
import { calendarScale, consecutiveRuns, observedSpan } from '../chart-dates.js'

// Interactive daily late-rate p chart for ONE zone. Plots only what the API
// returned: rate, lower, upper per day and the zone's p_bar. No statistics here.
// Hover anywhere to read a day, click (or Enter) to select it, ← / → to step.

const W = 820
const H = 330
const PAD = { l: 46, r: 18, t: 30, b: 34 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`
const RANGES = [['all', 'All'], [21, 'Last 21 observed dates'], [14, 'Last 14 observed dates'], [7, 'Last 7 observed dates']]

export default function PChart({ points: allPoints, pBar, zone, onPick, selected, withBaseline, onToggleBaseline }) {
  const [hover, setHover] = useState(null)
  const [range, setRange] = useState('all')
  const [showBand, setShowBand] = useState(true)
  const svgRef = useRef(null)

  const points = range === 'all' ? allPoints : allPoints.slice(-range)
  if (allPoints.length === 0) return <p className="muted">No days to plot for zone {zone}.</p>
  const span = observedSpan(points)

  const vals = points.flatMap((p) => [p.rate, p.upper, p.lower]).filter((v) => v != null)
  const hi = Math.max(0.05, pBar ?? 0, ...vals)
  const lo = Math.min(pBar ?? 1, ...vals)
  const step = hi - lo > 0.3 ? 0.1 : 0.05
  const yMax = Math.min(1, Math.ceil((hi + 0.02) / step) * step)
  const yMin = Math.max(0, Math.floor((lo - 0.02) / step) * step)
  const ticks = []
  for (let t = yMin; t <= yMax + 1e-9; t += step) ticks.push(t)

  const plotW = W - PAD.l - PAD.r
  const { slot, x } = calendarScale(points, PAD.l, plotW)
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin))
  const firstMon = points.findIndex((p) => p.period === 'monitoring')
  const split = firstMon > 0 ? x(firstMon) - slot / 2 : null

  const baseRuns = consecutiveRuns(points, (p) => p.period === 'baseline' && p.rate != null)
  const monitoringRuns = consecutiveRuns(points, (p) => p.period === 'monitoring' && p.rate != null)
  const line = (run) => run.map(({ point, index }) => `${x(index)},${y(point.rate)}`).join(' ')

  const every = Math.max(1, Math.ceil(points.length / 9))
  const last = points.length - 1
  const labelled = points.map((p, i) => i).filter((i) => i === last || (i % every === 0 && last - i >= every))

  let peak = -1
  points.forEach((p, i) => { if (p.status === 'high' && (peak < 0 || p.rate > points[peak].rate)) peak = i })
  const sel = points.findIndex((p) => p.date === selected && p.period === 'monitoring')
  const hovered = hover != null && hover < points.length ? hover : null
  const shown = hovered ?? (sel >= 0 ? sel : null)

  // pointer position -> nearest day index (SVG is scaled to the figure width)
  const indexAt = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    const sx = ((e.clientX - r.left) / r.width) * W
    return points.reduce((nearest, _, i) => Math.abs(x(i) - sx) < Math.abs(x(nearest) - sx) ? i : nearest, 0)
  }
  const pickIndex = (i) => { if (points[i]?.period === 'monitoring') onPick?.(points[i]) }
  const monIdx = points.map((p, i) => (p.period === 'monitoring' ? i : -1)).filter((i) => i >= 0)
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const cur = sel >= 0 ? monIdx.indexOf(sel) : e.key === 'ArrowLeft' ? monIdx.length : -1
    const next = monIdx[Math.min(monIdx.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)))]
    if (next != null) { setHover(null); pickIndex(next) }
  }

  return (
    <figure className="chart">
      <div className="chart-tools">
        <span className="seg" role="group" aria-label="Date range">
          {RANGES.map(([k, label]) => (
            <button key={k} className={range === k ? 'on' : ''} onClick={() => { setRange(k); setHover(null) }} aria-pressed={range === k}>{label}</button>
          ))}
        </span>
        <button className={showBand ? 'toggle on' : 'toggle'} onClick={() => setShowBand(!showBand)} aria-pressed={showBand}>
          <svg width="18" height="10"><rect width="18" height="10" fill="var(--band)" /><line x1="0" x2="18" y1="1" y2="1" className="keyline limit" /><line x1="0" x2="18" y1="9" y2="9" className="keyline limit" /></svg>
          3σ control limits
        </button>
        {onToggleBaseline && (
          <button className={withBaseline ? 'toggle on' : 'toggle'} onClick={onToggleBaseline} aria-pressed={!!withBaseline}>
            <svg width="18" height="10"><line x1="0" x2="18" y1="5" y2="5" className="series base" /></svg>
            baseline days
          </button>
        )}
        <span className="hint-keys">hover · click a day · ← → to step</span>
      </div>
      <figcaption className="key">
        <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" className="series" /></svg>Daily late share</span>
        <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" className="keyline center" /></svg>{`Baseline p̄ ${pct(pBar)}`}</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" className="mk critical" /></svg>Above UCL</span>
        <span><svg width="14" height="14"><Marker cx={7} cy={7} status="low" small /></svg>Below LCL</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="4" className="mk hollow pending" /></svg>No verdict yet</span>
      </figcaption>
      <p className="muted">{span.start} – {span.end} · {span.observed} observed dates across {span.calendarDays} calendar days. Missing dates or unavailable rates are gaps, not zero.</p>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} className={showBand ? 'plot' : 'plot noband'}
        aria-label={`Daily late rate for zone ${zone}, ${points.length} observed dates from ${span.start} to ${span.end}. Use the left and right arrow keys to step through observed dates; details are in the table below.`}
        onPointerMove={(e) => setHover(indexAt(e))} onPointerLeave={() => setHover(null)}
        onClick={(e) => pickIndex(indexAt(e))} onKeyDown={onKey}>
        {split != null && <rect className="base-zone" x={PAD.l} y={PAD.t} width={split - PAD.l} height={H - PAD.t - PAD.b} />}

        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{`${Math.round(t * 100)}%`}</text>
          </g>
        ))}

        {points.map((p, i) =>
          p.upper == null || p.lower == null || p.rate == null ? null : (
            <g key={`lim${i}`} className="limit">
              <rect className="band" x={x(i) - slot / 2} width={slot} y={y(p.upper)} height={Math.max(0, y(p.lower) - y(p.upper))} />
              <line x1={x(i) - slot / 2} x2={x(i) + slot / 2} y1={y(p.upper)} y2={y(p.upper)} />
              <line x1={x(i) - slot / 2} x2={x(i) + slot / 2} y1={y(p.lower)} y2={y(p.lower)} />
            </g>
          )
        )}

        {split != null && (
          <g className="divider">
            <line x1={split} x2={split} y1={PAD.t - 6} y2={H - PAD.b} />
            <text x={split - 6} y={PAD.t - 10} textAnchor="end">◀ baseline</text>
            <text x={split + 6} y={PAD.t - 10}>monitoring ▶</text>
          </g>
        )}

        {pBar != null && <g className="center"><line x1={PAD.l} x2={W - PAD.r} y1={y(pBar)} y2={y(pBar)} /></g>}

        {shown != null && <rect className="hover-col" x={x(shown) - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} />}
        {hovered != null && <line className="cross" x1={x(hovered)} x2={x(hovered)} y1={PAD.t} y2={H - PAD.b} />}

        {baseRuns.map((run) => <polyline key={`base-${run[0].index}`} data-rate-segment="baseline" className="series base" points={line(run)} />)}
        {monitoringRuns.map((run) => <polyline key={`mon-${run[0].index}`} data-rate-segment="monitoring" className="series" points={line(run)} />)}

        {sel >= 0 && points[sel].rate != null && <circle className="ring" cx={x(sel)} cy={y(points[sel].rate)} r="11" />}

        {points.map((p, i) => (p.rate == null ? null : (
          <Marker key={`pt${i}`} cx={x(i)} cy={y(p.rate)} status={p.status} big={hovered === i || i === peak} />
        )))}

        {peak >= 0 && (
          <text className="peak" x={x(peak)} y={y(points[peak].rate) - 14} textAnchor="middle">
            {`${shortDate(points[peak].date)} · ${pct(points[peak].rate)}`}
          </text>
        )}

        {labelled.map((i) => <text key={`d${i}`} x={x(i)} y={H - 10} textAnchor="middle">{shortDate(points[i].date)}</text>)}
      </svg>

      {hovered != null && <Tooltip p={points[hovered]} pBar={pBar} left={(x(hovered) / W) * 100} />}

      {shown != null && (
        <div className="readout" aria-live="polite">
          <b>{shortDate(points[shown].date)}</b>
          <span>{points[shown].period}</span>
          <span>{`${points[shown].late} / ${points[shown].n} late`}</span>
          <span>{pct(points[shown].rate)}</span>
          <span>{`limits ${pct(points[shown].lower)} – ${pct(points[shown].upper)}`}</span>
          <span>{`${statusInfo(points[shown].status).icon} ${statusInfo(points[shown].status).label}`}</span>
        </div>
      )}
    </figure>
  )
}

function Marker({ cx, cy, status, small, big }) {
  const info = statusInfo(status)
  const r = big ? 6.5 : 4.5
  if (status === 'low') {
    const s = small ? 6 : big ? 9 : 7
    return <path className={`mk ${info.tone}`} d={`M${cx - s},${cy - s * 0.6} L${cx + s},${cy - s * 0.6} L${cx},${cy + s * 0.9} Z`} />
  }
  if (status === 'high') return <circle className="mk critical" cx={cx} cy={cy} r={big ? 7 : 5.5} />
  if (info.formal) return <circle className={`mk ${info.tone}`} cx={cx} cy={cy} r={small ? 3 : big ? 5 : 3.2} />
  return <circle className={`mk hollow ${info.tone}`} cx={cx} cy={cy} r={r - 1} />
}

function Tooltip({ p, pBar, left }) {
  const info = statusInfo(p.status)
  return (
    <div className="tip" style={{ left: `${Math.min(Math.max(left, 16), 84)}%` }} role="status">
      <strong>{p.date}</strong> · {p.period}
      <div>{`Late rate ${pct(p.rate)} = ${p.late} late / ${p.n} responses`}</div>
      <div>{`Limits ${pct(p.lower)} – ${pct(p.upper)} · p̄ ${pct(pBar)}`}</div>
      <div>{`${info.icon} ${info.label}`}</div>
      {p.reasons?.length > 0 && <div className="muted">{reasonsText(p.reasons)}</div>}
      {p.period === 'monitoring' && <div className="hint">Click to select this day</div>}
    </div>
  )
}
