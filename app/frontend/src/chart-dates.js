// API dates are New York calendar labels (YYYY-MM-DD), not instants. UTC day
// ordinals compare those labels without DST shortening or lengthening a day.
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / 86400000

export function observedSpan(points) {
  const dates = [...new Set(points.map((p) => p.date))].sort()
  const start = dates[0] ?? null
  const end = dates[dates.length - 1] ?? null
  const calendarDays = start == null ? 0 : dayNumber(end) - dayNumber(start) + 1
  return { start, end, observed: dates.length, calendarDays, hasGaps: calendarDays > dates.length }
}

export function calendarScale(points, left, width) {
  const span = observedSpan(points)
  const slot = width / Math.max(1, span.calendarDays)
  return {
    slot,
    x: (index) => left + (dayNumber(points[index].date) - dayNumber(span.start) + 0.5) * slot,
  }
}

// A missing calendar date or an unavailable API rate ends a segment. Never
// interpolate over either, and never synthesize a zero-rate missing day.
export function consecutiveRuns(points, accepts = (p) => p.rate != null) {
  const runs = []
  let previous = null
  let run = null
  points.forEach((point, index) => {
    if (!accepts(point)) { previous = null; run = null; return }
    if (previous == null || dayNumber(point.date) - dayNumber(previous.date) !== 1) {
      run = []
      runs.push(run)
    }
    run.push({ point, index })
    previous = point
  })
  return runs
}
