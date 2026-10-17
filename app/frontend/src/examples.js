// Example datasets the page can load without an upload. The CSVs stay in
// data/ (H-02); Vite copies them next to the build and the page fetches one
// on demand. Settings are the ones each codebook prescribes.
import stableUrl from '../../../data/jingyao_synthetic/stable.csv?url'
import shiftUrl from '../../../data/jingyao_synthetic/zone_shift.csv?url'
import edgeUrl from '../../../data/jingyao_synthetic/edge_cases.csv?url'
import nycUrl from '../../../data/real_nyc_brooklyn_queens_sev2.csv?url'

const SYN = { selected_priority: 'P1', target_minutes: '10', baseline_end: '2026-09-21', as_of: '2026-10-01T00:00:00' }

export const EXAMPLES = {
  stable: { label: 'Synthetic · stable conditions (stable.csv)', file: 'stable.csv', url: stableUrl, settings: SYN },
  zone_shift: { label: 'Synthetic · planted shift in zone A (zone_shift.csv)', file: 'zone_shift.csv', url: shiftUrl, settings: SYN },
  nyc: {
    label: 'REAL public data · NYC EMS, Brooklyn & Queens (real_nyc_brooklyn_queens_sev2.csv)',
    file: 'real_nyc_brooklyn_queens_sev2.csv', url: nycUrl,
    settings: { selected_priority: '2', target_minutes: '10', baseline_end: '2026-08-21', as_of: '2026-10-02T00:00:00' },
  },
  edge_cases: { label: 'Synthetic · data-quality edge cases (edge_cases.csv)', file: 'edge_cases.csv', url: edgeUrl,
    settings: { ...SYN, as_of: '2026-10-01T12:00:00' } },
}

/** First-visit default: the planted shift shows signals within seconds. ?example=<key> overrides it. */
export const DEFAULT_EXAMPLE = 'zone_shift'
