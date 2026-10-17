import { useMemo, useState } from 'react'
import { showNy } from '../time.js'
import { shortDate } from './PChart.jsx'
import NYC from '../geo/nyc-boroughs.json'

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

// --- real NYC borough outlines (NYC Open Data), used when every zone is a borough ---
const ringPath = (r) => `M${r.map((p) => p.join(',')).join('L')}Z`
const inRing = ([x, y], r) => {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const centroid = (r) => {
  let a = 0, cx = 0, cy = 0
  r.forEach(([x1, y1], i) => {
    const [x2, y2] = r[(i + 1) % r.length]
    const f = x1 * y2 - x2 * y1
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
  })
  return [cx / (3 * a), cy / (3 * a)]
}
const boroughOf = (z) => NYC.boroughs.find((b) => b.name.toLowerCase() === String(z).toLowerCase())
// order used to host zones that are not boroughs (synthetic labels such as A, B)
const HOST_ORDER = ['Brooklyn', 'Queens', 'Manhattan', 'Bronx', 'Staten Island']

// zone -> the borough it is drawn on: its own borough if it is one, otherwise
// the next unused borough. Null when there are more zones than boroughs.
function hostBoroughs(zones) {
  if (zones.length === 0 || zones.length > NYC.boroughs.length) return null
  const host = {}
  zones.forEach((z) => { const b = boroughOf(z); if (b) host[z] = b })
  const free = HOST_ORDER.map(boroughOf).filter((b) => b && !Object.values(host).includes(b))
  zones.forEach((z) => { if (!host[z]) host[z] = free.shift() })
  return host
}

export default function IllustrativeMap({ res, zone, day, onPickZone, onViewIncidents }) {
  const [scope, setScope] = useState('day')
  const [hover, setHover] = useState(null)
  const target = res.meta.target_minutes
  const zones = res.zone_baselines.map((b) => b.zone)

  const host = useMemo(() => hostBoroughs(zones), [zones.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  const real = host != null
  const stand = real ? zones.filter((z) => !boroughOf(z)) : [] // zones drawn on a borough they are not

  const layout = useMemo(() => {
    if (real) {
      return Object.fromEntries(zones.map((z) => {
        const b = host[z]
        const xs = b.rings.flat().map((p) => p[0]), ys = b.rings.flat().map((p) => p[1])
        const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
        const [lx, ly] = centroid(b.rings[0])
        return [z, {
          d: b.rings.map(ringPath).join(''), label: [lx, ly],
          // a fixed random point inside the real outline (rejection sampling)
          place: (r) => {
            for (let k = 0; k < 80; k++) {
              const pt = [box[0] + r() * (box[2] - box[0]), box[1] + r() * (box[3] - box[1])]
              if (b.rings.some((ring) => inRing(pt, ring))) return pt
            }
            return [lx, ly]
          },
        }]
      }))
    }
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
      return [z, {
        d: blob(cx, cy, rx, ry, z), label: [cx, cy - ry * 1.06 - 26],
        place: (r) => {
          const a = r() * Math.PI * 2
          const rad = Math.sqrt(r()) * 0.8
          return [cx + Math.cos(a) * rad * rx, cy + Math.sin(a) * rad * ry]
        },
      }]
    }))
  }, [zones.join('|'), host]) // eslint-disable-line react-hooks/exhaustive-deps

  const all = res.late_incidents.filter((i) => i.phase === 'monitoring' && (scope === 'period' || i.date === day))
  const shown = all.slice(0, MAX_DOTS)
  const maxMin = Math.max(target + 1, ...shown.map((i) => i.response_minutes))
  const dots = shown.map((i) => {
    const L = layout[i.zone]
    if (!L) return null
    const [x, y] = L.place(rng(`pos:${i.incident_id}:${i.row_number}`))
    const sev = Math.min(1, (i.response_minutes - target) / (maxMin - target))
    const k = real ? 0.7 : 1 // smaller dots on the real, denser map
    return { i, x, y, s: (1.8 + sev * 3.4) * k, o: 0.35 + sev * 0.6 }
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
          {real && NYC.boroughs.filter((b) => !Object.values(host).includes(b)).map((b) => {
            const [x, y] = centroid(b.rings[0])
            return (
              <g key={b.name} className="borough-ctx">
                <path d={b.rings.map(ringPath).join('')} />
                <text x={x} y={y} textAnchor="middle">{b.name}</text>
              </g>
            )
          })}
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
              <g key={`l${b.zone}`} className="zone-label" transform={`translate(${L.label[0]},${L.label[1]})`}>
                <text textAnchor="middle" className="zn">{stand.includes(b.zone) ? `Zone ${b.zone}` : b.zone}</text>
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
        {real ? (
          <><b>Real borough outlines, simulated positions.</b> Outlines are the official NYC borough boundaries (NYC Open
          Data, Borough Boundaries).{stand.length > 0
            ? ` This dataset's zone${stand.length > 1 ? 's' : ''} ${stand.join(', ')} ${stand.length > 1 ? 'are' : 'is'} not real place${stand.length > 1 ? 's' : ''}; for illustration ${stand.map((z) => `${z} is drawn on ${host[z].name}`).join(' and ')}.`
            : ' The data record only the borough.'} Each dot is placed at a fixed random point inside its
          zone&rsquo;s outline: its position there carries no meaning.</>
        ) : (
          <><b>Simulated positions.</b> The datasets record only a zone label, not coordinates, so zone shapes and dot
          positions here are generated and carry no geographic meaning.</>
        )} The number of dots, their zone, date and
        response minutes, and each zone&rsquo;s signal state are real API output. With incident coordinates logged
        by the dispatch system, the same view would show where slow responses cluster inside a zone.
        {all.length > MAX_DOTS && ` Showing the first ${MAX_DOTS} of ${all.length} late responses.`}
      </p>
    </section>
  )
}
