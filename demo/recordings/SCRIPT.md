# Live demonstration script (H-05), about 3 minutes

Order and talking points for the live demonstration at the showcase (no video is recorded). Numbers below are the tool's
actual output on the published datasets, verified in the browser
([`app/frontend/acceptance/`](../../app/frontend/acceptance/README.md), commit `e189c4b`).
The step-by-step written walkthrough is [`demo/README.md`](../README.md) (Jingyao);
keep the settings here identical to it.

**Before recording:**
- Start the tool with `bash app/testme.sh`, or open the deployed URL once H-06 is live.
- Open the page with mock mode **off**: there must be no red banner.
- Set browser zoom to about 90% and close other tabs.
- Have these files ready to import:
  - `data/jingyao_synthetic/stable.csv`
  - `data/jingyao_synthetic/zone_shift.csv`
  - `data/jingyao_synthetic/edge_cases.csv`
  - `data/real_nyc_brooklyn_queens_sev2.csv`

**Settings for the synthetic files:**
- Priority `P1`, target `10` minutes, baseline ends at the start of `2026-09-21`.
- Analysis time: `2026-10-01 00:00:00` for `stable` and `zone_shift`, `2026-10-01 12:00:00` for `edge_cases`.

## 0:00–0:20 — What it is (Data & Settings page, empty)

> This is a late-response monitor for an ambulance dispatch supervisor. It takes five columns from the dispatch log —
> incident ID, zone, priority, dispatch time and on-scene time — and asks, zone by zone, whether the daily share
> of responses slower than the target has changed from that zone's own baseline. It is a p chart, and all the statistics
> are computed on the server, not in the browser.

## 0:20–0:55 — Stable data (`stable.csv`)

Steps:
1. Import `stable.csv` and enter the settings above.
2. Click **Run analysis**, then **View zone chart**.
3. Point to "Baseline not reviewed".
4. Tick **Baseline reviewed** for zone A, then for zone B.

> Twelve thousand synthetic responses, all usable. Before I review the baseline, the tool refuses to give verdicts —
> every day says "Baseline not reviewed". Zone A's baseline: 291 late out of 2,000, so p-bar is 14.55%.
> With 100 responses a day, the limits are 4.0% to 25.1%. After I confirm both baselines, nothing crosses its limits —
> zero signals. Zone A's worst day was 23%, still inside. That is "no signal", not proof the process is perfect.

## 0:55–1:35 — Planted change (`zone_shift.csv`)

Steps:
1. Back to data, import `zone_shift.csv`, Run.
2. Confirm A and B.
3. Show the zone A chart and the **Days to review** table.

> Same baseline, but we planted a deterioration: zone A, priority 1, from September 21.
> The tool flags eight high days, from 30% up to 43%, all above the 25.1% upper limit.
> Two days, September 21 and 24, at 23% and 24%, stay inside the limits, so they are not signals.
> Zone B is unchanged and shows nothing.

Then click **View incidents** on the A / September 22 row. It shows 41 late responses:

> And here are the 41 late responses behind September 22, sorted by response time, for follow-up.
> A single late incident is not automatically a statistical outlier.

## 1:35–2:10 — Data problems (`edge_cases.csv`, analysis time Oct 1 12:00)

Steps:
1. Import `edge_cases.csv` and Run.
2. Point at the coverage line, then open **All 11 excluded rows (all priorities)** under the record preview. The bad rows are rows 5008–5018, beyond the 100-row preview.
3. Open zone EDGE.

> Real logs are messy. Of 5,118 rows, 11 are excluded and each says why — missing arrival, reversed times,
> a timestamp without a time zone, a future time, a duplicate ID where both copies are removed.
> Days with too little data say "Insufficient data" instead of guessing: 49 responses is not enough here.
> And October 1 is "Provisional (today)" because the day is not over.

## 2:10–2:50 — Real NYC data (`real_nyc_brooklyn_queens_sev2.csv`)

Settings:
- Priority `2`, target `10`.
- Baseline ends `2026-08-21`.
- Analysis time `2026-10-02 00:00:00`.

Steps:
1. Run the analysis.
2. Confirm Brooklyn and Queens.
3. Show the Brooklyn chart and the **Days to review** table.

> Finally, real public FDNY EMS data — 26,209 Brooklyn and Queens responses from NYC Open Data. Brooklyn's
> August baseline is 22.2% late, Queens 34.5%. The tool compares each borough with its own baseline, so this is not
> a ranking. Brooklyn has six high days in September; on September 4 it was 85 late out of 286, 29.7%, just over
> that day's 29.6% limit. Queens has two.

## 2:50–3:00 — Close

> The 10-minute target defines lateness; the control limits detect change. All numbers were checked against
> hand calculations and the statistics core.
