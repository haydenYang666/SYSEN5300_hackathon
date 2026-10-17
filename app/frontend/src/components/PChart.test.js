import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PChart from './PChart.jsx'

const point = (date, rate = 0.1) => ({ date, rate, lower: 0.01, upper: 0.19, n: 100, late: rate == null ? 0 : rate * 100, period: 'monitoring', status: 'no_signal', reasons: [] })
const render = (points) => renderToStaticMarkup(createElement(PChart, { points, pBar: 0.1, zone: 'A' }))

describe('p chart date semantics', () => {
  it('labels observation windows and the complete actual date span', () => {
    const html = render(['2026-08-21', '2026-08-24', '2026-08-28', '2026-09-01', '2026-09-05', '2026-09-10', '2026-09-18'].map((d) => point(d)))
    expect(html).toContain('Last 7 observed dates')
    expect(html).not.toContain('>7 days<')
    expect(html).toContain('2026-08-21 – 2026-09-18')
    expect(html).toContain('7 observed dates across 29 calendar days')
    expect(html.match(/data-rate-segment=/g)).toHaveLength(7)
    const limits = [...html.matchAll(/class="band" x="([^"]+)" width="([^"]+)"/g)]
    expect(limits).toHaveLength(7)
    expect(Number(limits[1][1]) - Number(limits[0][1])).toBeCloseTo(3 * Number(limits[0][2]))
  })

  it('does not connect over a returned null rate', () => {
    const html = render([point('2026-09-01'), point('2026-09-02', null), point('2026-09-03')])
    expect(html.match(/data-rate-segment=/g)).toHaveLength(2)
    expect(html).toContain('Missing dates or unavailable rates are gaps')
  })

  it('continues a daily series with its known API limits', () => {
    const html = render([point('2026-09-01', 0.19), point('2026-09-02', 0.2)])
    expect(html.match(/data-rate-segment=/g)).toHaveLength(1)
    expect(html).toContain('2 observed dates across 2 calendar days')
    expect(html).toContain('Baseline p̄ 10.0%')
  })
})
