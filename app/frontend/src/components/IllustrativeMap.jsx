import { useMemo, useState } from 'react'
import { showNy } from '../time.js'
import { shortDate } from './PChart.jsx'

// ILLUSTRATIVE map. The data have no coordinates (only a zone label), so the
// zone shapes, their layout and every dot's position are SIMULATED: a fixed
// pseudo-random function of the zone name / incident ID, stable across reloads
// and meaningless as geography. What IS real, from the API: which late
// responses exist (one dot each), their zone, date and minutes, and each
// zone's signal / review state. No statistics are computed here.

const W = 820
const H = 410
const MAX_DOTS = 6000

// FNV-1a string hash -> mulberry32 generator: deterministic "random" numbers
function rng(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// an irregular, smooth "district" outline around (cx, cy)
function blob(cx, cy, rx, ry, seed) {
  const r = rng(`shape:${seed}`)
  const pts = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2
    const k = 0.86 + r() * 0.2
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]
  })
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  let d = `M${mid(pts[13], pts[0]).join(',')}`
  pts.forEach((p, i) => { d += ` Q${p.join(',')} ${mid(p, pts[(i + 1) % 14]).join(',')}` })
  return `${d} Z`
}

export default function IllustrativeMap({ res, zone, day, onPickZone, onViewIncidents }) {
  const [scope, setScope] = useState('day')
  const [hover, setHover] = useState(null)
  const target = res.meta.target_minutes
  const zones = res.zone_baselines.map((b) => b.zone)

  const layout = useMemo(() => {
    const n = zones.length
    const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const cw = W / cols
    const ch = H / rows
    return Object.fromEntries(zones.map((z, i) => {
      const cx = cw * ((i % cols) + 0.5)
      const cy = ch * (Math.floor(i / cols) + 0.5) + 20
      const rx = cw * 0.42
      const ry = ch * 0.34
      return [z, { cx, cy, rx, ry, d: blob(cx, cy, rx, ry, z) }]
    }))
  }, [zones.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const all = res.late_incidents.filter((i) => i.phase === 'monitoring' && (scope === 'period' || i.date === day))
  const shown = all.slice(0, MAX_DOTS)
  const maxMin = Math.max(target + 1, ...shown.map((i) => i.response_minutes))
  const dots = shown.map((i) => {
    const L = layout[i.zone]
    if (!L) return null
    const r = rng(`pos:${i.incident_id}:${i.row_number}`)
    const a = r() * Math.PI * 2
    const rad = Math.sqrt(r()) * 0.8
    const sev = Math.min(1, (i.response_minutes - target) / (maxMin - target))
    return { i, x: L.cx + Math.cos(a) * rad * L.rx, y: L.cy + Math.sin(a) * rad * L.ry, s: 1.8 + sev * 3.4, o: 0.35 + sev * 0.6 }
  }).filter(Boolean)

  const count = (z) => all.filter((i) => i.zone === z).length
  const sigs = (z, s) => res.signals.filter((x) => x.zone === z && x.status === s).length
  const zoneClass = (b) => {
    if (sigs(b.zone, 'high')) return 'zhi'
    if (sigs(b.zone, 'low')) return 'zlo'
    if (b.status === 'unreviewed_baseline') return 'zwait'
    if (b.status === 'insufficient_data') return 'zna'
    return 'zok'
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Where were the late responses?</h2>
        <span className="sim-badge">Simulated locations</span>
        <span className="aside">illustration of a map view once real coordinates are logged</span>
      </div>
      <div className="chart-tools">
        <span className="seg" role="group" aria-label="Map period">
          <button className={scope === 'day' ? 'on' : ''} onClick={() => setScope('day')} aria-pressed={scope === 'day'}>
            {day ? shortDate(day) : 'Selected day'}
          </button>
          <button className={scope === 'period' ? 'on' : ''} onClick={() => setScope('period')} aria-pressed={scope === 'period'}>
            Whole monitoring period
          </button>
        </span>
        <span className="hint-keys">hover a dot · click a dot or zone</span>
      </div>

      <div className="map-wrap" onMouseLeave={() => setHover(null)}>
        <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Illustrative map with simulated positions: ${all.length} late responses across ${zones.length} zones.`}>
          <defs>
            <pattern id="mapgrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" className="mapgrid" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#mapgrid)" />
          {res.zone_baselines.map((b) => (
            <path key={b.zone} d={layout[b.zone].d} className={`zone-shape ${zoneClass(b)}${b.zone === zone ? ' on' : ''}`}
              onClick={() => onPickZone(b.zone)}>
              <title>{`${b.zone}: click to select`}</title>
            </path>
          ))}
          {dots.map((d) => (
            <circle key={`${d.i.row_number}`} cx={d.x} cy={d.y} r={d.s} className="dot" style={{ opacity: d.o }}
              onMouseEnter={() => setHover(d)} onClick={() => onViewIncidents(d.i.zone, d.i.date)} />
          ))}
          {hover && <circle cx={hover.x} cy={hover.y} r={hover.s + 4} className="dot-ring" />}
          {res.zone_baselines.map((b) => {
            const L = layout[b.zone]
            const hi = sigs(b.zone, 'high')
            return (
              <g key={`l${b.zone}`} className="zone-label" transform={`translate(${L.cx},${L.cy - L.ry * 1.06 - 26})`}>
                <text textAnchor="middle" className="zn">{b.zone}</text>
                <text textAnchor="middle" y="16" className="zs">
                  {`${count(b.zone)} late${scope === 'day' && day ? ` on ${shortDate(day)}` : ''}${hi ? ` · ${hi} high day${hi > 1 ? 's' : ''}` : ''}`}
                </text>
              </g>
            )
          })}
        </svg>
        {hover && (
          <div className="tip map-tip" style={{ left: `${Math.min(Math.max((hover.x / W) * 100, 15), 85)}%`, top: `${(hover.y / H) * 100}%` }}>
            <strong>{hover.i.incident_id}</strong> · {hover.i.zone}
            <div>{`${hover.i.response_minutes.toFixed(2)} min to scene (late: over ${target})`}</div>
            <div>{`dispatched ${showNy(hover.i.dispatched_at)}`}</div>
            <div className="hint">Click to open this day in Incident Review · position simulated</div>
          </div>
        )}
      </div>

      <div className="key">
        <span><svg width="14" height="14"><circle cx="7" cy="7" r="5" className="dot" style={{ opacity: 0.9 }} /></svg>late response (bigger, darker = slower)</span>
        <span><span className="swatch zhi" />zone with high-signal days</span>
        <span><span className="swatch zwait" />baseline not reviewed</span>
        <span><span className="swatch zok" />no signals</span>
      </div>
      <p className="read">
        <b>Simulated positions.</b> The datasets record only a zone label, not coordinates, so zone shapes and dot
        positions here are generated and carry no geographic meaning. The number of dots, their zone, date and
        response minutes, and each zone&rsquo;s signal state are real API output. With incident coordinates logged
        by the dispatch system, the same view would show where slow responses cluster inside a zone.
        {all.length > MAX_DOTS && ` Showing the first ${MAX_DOTS} of ${all.length} late responses.`}
      </p>
    </section>
  )
}
