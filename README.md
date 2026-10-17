# Chinese Can Fly — Emergency Response Monitor

A dashboard for **ambulance dispatch supervisors** reviewing completed responses within one
priority category. Import dispatch/arrival records, inspect each zone's daily proportion of
late responses, and open the completed incidents that need human review. The Python statistical
core powers a FastAPI service and React dashboard.

**[Open the live dashboard](https://connect.systems-apps.com/content/fbeb8e54-b833-4b0f-8d87-8ca4617354a8/)** ·
[Live API docs](https://connect.systems-apps.com/content/60e1dac5-58e2-42d7-b83d-4f95318a4a31/docs) ·
[Four-dataset walkthrough](demo/README.md) · [Live demonstration plan](demo/recordings/README.md)

The dashboard and API health endpoint were reachable without credentials on October 16, 2026;
health reported `analysis_mode: real`. The demonstration is given live on this dashboard at the
showcase; there is no recorded video. H-05 independent playback and H-07 teammate fresh-clone acceptance remain pending
in the team ledger; available deployment evidence is linked below.

## Try the dashboard

A first visit loads the real NYC EMS extract (`real_nyc_brooklyn_queens_sev2.csv`: public NYC Open Data,
priority 2, Brooklyn and Queens) and analyzes it with the real API; click **Confirm all usable baselines**
to see its 8 high-signal days (6 in Brooklyn, 2 in Queens). Append `?example=zone_shift`, `?example=stable`
or `?example=edge_cases` to open a synthetic example. Read the source label: **Jingyao's three examples are synthetic; the NYC extract
is real public data**. Baselines start unreviewed. For an empty starting screen, append
`?example=none` to the dashboard URL.

1. **Data & Settings:** choose an example or import a CSV; imports replace the current session.
   Add a completed response with Save/Cancel, inspect source records and exclusions, and export
   the session CSV. Select priority, target, baseline cutoff and optional historical analysis time.
2. **Zone Monitoring:** run analysis, inspect baseline daily/weekday checks, and confirm each
   usable zone's baseline after review. Filter zones, hover the chart for values, and inspect
   the days-to-review list. Baseline confirmation records human review, not proof of stability.
3. **Incident Review:** open a zone/date from the chart, sort late incidents by response time or
   timestamp, clear filters, and return to the chart or data.
4. **Live Simulation** is optional: a separate, visibly **SYNTHETIC** session generates records
   and calls the real API. It has a simulated historical clock, not a live ambulance feed.
   See [simulation controls and settings](docs/live-simulation.md).

Editing data/settings clears old analysis and baseline confirmations. Newer user actions cancel
obsolete loads/results. Records remain in browser memory, so export before refreshing or closing.
A light/dark theme preference may persist; imported response records are not saved to a database.

## Run locally

Prerequisites: **Python 3.12 or 3.13**, **Node.js 22 or later compatible with Vite 6**, npm, Git,
and Bash. Python 3.12 is the deployment runtime. Install dependencies once from the repository root:

```bash
git clone https://github.com/haydenYang666/SYSEN5300_hackathon.git
cd SYSEN5300_hackathon
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r app/requirements.txt
npm --prefix app/frontend ci
```

Then start both services with **one command**:

```bash
bash app/testme.sh
```

Open http://127.0.0.1:5173 (dashboard) or http://127.0.0.1:8000/docs (API).
The script forces real API mode. Ctrl-C stops both services. On subsequent sessions, activate
`.venv` before startup. Windows users can use Git Bash: create the venv with `py -3.12 -m venv .venv`,
activate with `source .venv/Scripts/activate`, and run `PYTHON_BIN=python bash app/testme.sh`.
See [app/README.md](app/README.md) for API-only startup, port overrides and troubleshooting.

## Inputs and parameters

CSV requires these five columns; extra imported columns are retained for export and ignored by
analysis. Synthetic rows represent dispatched responses. The NYC extract instead represents an
incident's first assignment to first on-scene arrival; read its source mapping before comparison.

| Record column | Type / meaning | Where it would come from |
|---|---|---|
| `incident_id` | Nonempty text, unique across the import | Dispatch system response/incident identifier |
| `zone` | Nonempty text service-zone label | Recorded dispatch assignment |
| `priority` | Nonempty text category; P1/P2 are synthetic, NYC uses string `"2"` | Assigned priority / source initial severity code |
| `dispatched_at` | ISO 8601 timestamp with UTC offset | Dispatch/assignment event clock |
| `on_scene_at` | ISO 8601 timestamp with UTC offset | Recorded on-scene arrival |

The core subtracts timestamp instants to obtain **elapsed minutes** and groups by dispatch date
in **America/New_York**. Exactly the target is on time; only a strictly longer duration is late.
Missing, malformed, reversed, future, blank-field or duplicate-ID rows are explicitly excluded;
all copies of a duplicate ID are excluded. No imputation of zero response times is performed.

| Analysis field | Type / default | Meaning |
|---|---|---|
| `records` | Required array of row objects | CSV records or equivalent JSON; `[]` is valid for the API |
| `target_minutes` | Required positive finite number; UI example 10 | Operational lateness threshold; illustrative, not a clinical standard |
| `selected_priority` | Required string | One category to analyze; never combine categories into one baseline |
| `baseline_end` | Required offset-aware timestamp | Exclusive New York local-midnight cutoff; no later than the start of the local `as_of` day |
| `reviewed_zones` | API default `[]` | Zone names whose baselines were reviewed for these data/settings |
| `as_of` | API default: current server time | Explicit observation cutoff for reproducible demos; future API values rejected |

Explicit nulls are not defaults. API numeric parameters must be JSON numbers, not strings or
booleans. The pure function requires all six arguments explicitly. Details of errors, empty input
and field types are in the [interface agreement](docs/interfaces.md).

## Method and interpretation

For each zone within the selected priority, use a daily **p chart** of late completed responses.
The frozen baseline is the weighted proportion `p_bar = total baseline late / total baseline n`.
For a monitoring day of n responses, the limits are:

```text
LCL = max(0, p_bar - 3 * sqrt(p_bar * (1 - p_bar) / n))
UCL = min(1, p_bar + 3 * sqrt(p_bar * (1 - p_bar) / n))
```

Only strict crossings signal; equality does not, with absolute proportion tolerance `1e-12`.
Formal verdicts require a closed local day, a reviewed nondegenerate baseline with at least
20 nonempty days, and `n*p_bar >= 5` and `n*(1-p_bar) >= 5`. The current day is provisional;
absent/degenerate baselines and insufficient samples have explicit reasons and no formal verdict.
Uncomputable quantities are `null`, not invented zero rates. The API returns proportions in 0–1
units; the UI displays percentages.

Baseline stability, comparable case mix and approximate independence are assumptions; daily and
weekday displays help review but cannot establish them. New monitoring rows never silently update
the baseline. Historical corrections or setting changes require a new analysis. Day closure does
not establish that every response has been completed or logged. Counts cover usable **recorded
completed responses**, excluding outstanding responses, cancellations and missing records; this
selection can bias the observed rate.

**Statistical limits to keep in mind.** The p chart assumes daily late counts vary binomially
around the baseline proportion. Real dispatch data can vary more than that (overdispersion: demand
surges, weather, staffing), which makes the limits too narrow and produces extra signals; with
hundreds of responses per day this is likely in the NYC extract. A Laney p′ chart, which widens
the limits by the observed between-day variation, is the natural next step. Each zone-day is also a
separate 3-sigma test, so about 0.27% of in-control days will still cross a limit by chance (roughly
one false alarm per 370 zone-days); a signal therefore means "review this day", not "this zone is
failing". No run rules are applied.

“No crossing signal found” is not proof of control or satisfactory performance. Individual late
incidents are not automatically statistical outliers; baseline-relative signals do not rank zone
quality or identify causes. The application supports operational review, without clinical triage,
routing or automatic dispatch.

## Functions, endpoints and verification

The sole statistical entry point is
`app.qc.analyze_response(records, target_minutes, selected_priority, baseline_end, reviewed_zones, as_of) -> dict`.
FastAPI calls it; React displays its results. [The app README](app/README.md#api-and-function-reference)
describes every public endpoint, request, result section and error status.

- `GET /health`: runtime status, schema version and analysis availability.
- `POST /analyze`: validate settings and return quality, exclusions, baselines, daily points,
  signals and late incidents from the core.
- `GET /`: API service message; `/docs`, `/redoc` and `/openapi.json` expose API documentation/schema.
  `/__docs__/` redirects to `/docs` for the deployment integration.

```bash
python -m pytest tests
npm --prefix app/frontend test
npm --prefix app/frontend run build
python data/jingyao_synthetic/verify.py
python tests/fixtures/api/verify_datasets.py
```

The dataset verifier starts its own temporary API. The simulation check uses the Python core and an in-process FastAPI test client:
`node app/frontend/acceptance/simulation_core_check.mjs`; no running server is needed. Set
`PYTHON_BIN` to the activated environment’s Python if required.
Known-answer fixtures check a 200/2000 baseline: n=100 limits are 1%/19%, 20 late signals high,
and 19 does not; n=400 limits are 5.5%/14.5%. See [core review](tests/fixtures/qc/REVIEW.md),
[H-04 acceptance](tests/fixtures/api/H04_CHECKIN.md), [live browser evidence](app/frontend/acceptance/README.md),
and [H-09 verification](docs/live-simulation.md). These reports identify the versions they tested.

## Demonstration datasets

Follow [demo/README.md](demo/README.md) in the same order as the recording script. All dates/times
in this table are New York local values, with `-04:00` offsets; target is 10 minutes throughout.

| File | Priority | Baseline cutoff | Fixed `as_of` | Actual result after eligible baseline review |
|---|---|---|---|---|
| `data/jingyao_synthetic/stable.csv` | P1 | 2026-09-21 00:00 | 2026-10-01 00:00 | 12000 usable; 0 signals |
| `data/jingyao_synthetic/zone_shift.csv` | P1 | 2026-09-21 00:00 | 2026-10-01 00:00 | Same baseline; 8 A/P1 high-signal days |
| `data/jingyao_synthetic/edge_cases.csv` | P1 | 2026-09-21 00:00 | 2026-10-01 12:00 | 5118 total / 5107 usable / 11 excluded; 20/100 current day is provisional |
| `data/real_nyc_brooklyn_queens_sev2.csv` | `"2"` | 2026-08-21 00:00 | 2026-10-02 00:00 | 26209 usable after source cleaning; 8 high-signal days |

Confirm A/B for the regular synthetic files, EDGE for Jingyao edge, and BROOKLYN/QUEENS for NYC.
NYC's zero app exclusions are after 1022 rows were removed upstream. Shifeng's three independent
synthetic files are additional fixtures, not replacements for Jingyao's recording inputs.
[Data index](data/README.md) · [Jingyao codebook](data/jingyao_synthetic/README.md) ·
[NYC codebook](data/README_real_nyc.md) · [Shifeng codebook](data/shifeng_synthetic/README.md).

## Team

Chinese Can Fly, Cornell SYSEN 5300 Six Sigma Hackathon (on-campus track), Emergency Response prompt.

| Member | Role |
|---|---|
| Shifeng Hong | Team lead; statistical core (`app/qc.py`), tests, interface contract, live simulation |
| Jingyao | Synthetic datasets and codebook, demo walkthrough, documentation |
| Julian Jiang | FastAPI backend, startup scripts, API tests |
| Pingchuan Liu | React dashboard, browser acceptance tests, demo recording |
| Hayden Yang | Real NYC dataset, Posit Connect deployment, repository and submission |

## Deployment and references

Hayden maintains separate Posit Connect API and static React workflows. Public application links
are above; publishing configuration/credentials stay in GitHub Actions secrets and variables.
The frontend builds against the deployed API via `VITE_API_URL`; fork contributors can run locally
without deployment access. See [deployment notes](app/README.md#deployment-and-live-access).

Method: [NIST proportions control charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm),
a cited QC extension beyond the team's listed course glossary. Real-data source:
[NYC EMS Incident Dispatch Data](https://data.cityofnewyork.us/d/76xm-jjuj).
Project [SPEC](SPEC.md), [team plan](docs/team.en.md), [task ledger](CONTRACT.yaml).
The application adapts the [Six Sigma Hackathon starter](https://github.com/timothyfraser/sixsigmahackathon)
and its `demos/fastapi/` example; see [LICENSE](LICENSE). Event information remains in
[docs/HACKATHON_README.md](docs/HACKATHON_README.md).
