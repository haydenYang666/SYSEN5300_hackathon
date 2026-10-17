# SPEC: Six Sigma Hackathon team project

What your tool IS. Your agent reads this before every task. Where the code and this file
disagree, the code is the bug: change this file first, then the code.

Most of this page is already decided by the event and the [rubric](docs/criteria.md).
**Only the `FILL IN` lines change, and you do not have to write them by hand:** describe your app and ask your agent to update them. They depend on the prompt your team picks at kickoff
(prompts are secret until then, see [`docs/prompts.md`](docs/prompts.md)) and on your team.
The examples after each `FILL IN` show the shape of an answer. They are not hints about the prompts.

## 1. Team and prompt
- **Team name:** Chinese Can Fly
- **Track:** On-campus (24 hours). See [`docs/schedule.md`](docs/schedule.md).
- **Prompt we chose:** Emergency Response (Health Systems), from the [Devpost](https://six-sigma-hackathon.devpost.com/) on-campus prompts. No prompt number is displayed on the challenge page.
- **Our public repo:** https://github.com/haydenYang666/SYSEN5300_hackathon

## 2. User and use case (rubric: scope 5, user and use case 5)
- **User:** The ambulance dispatch supervisor reviewing response performance for a selected priority class.
- **Decision the tool helps them make, and when:** After importing or entering completed dispatch records, identify which zones have an unusually high daily proportion of late arrivals and which completed incidents need human review.
- **Why this matches the prompt:** It replaces an overall monthly average with zone-specific monitoring and incident-level review using timestamps a dispatch center can log.

## 3. Inputs (rubric: minimal inputs 5)
Only what this user can actually measure or already knows. Fewer is better; every input a user
cannot measure costs points.

| Input | Type and units | Where the user gets it |
|---|---|---|
| `incident_id` | unique text identifier; one row per dispatched response | dispatch log |
| `zone` | text service-zone identifier | dispatch assignment |
| `priority` | text priority category; compare one selected category at a time | dispatch assignment; demo labels are synthetic categories |
| `dispatched_at` | ISO 8601 timestamp with UTC offset | time the ambulance is dispatched |
| `on_scene_at` | ISO 8601 timestamp with UTC offset | time arrival on scene is recorded |
| `target_minutes` | positive number, minutes; user-controlled analysis setting | the service's operational target; demo value 10 minutes is illustrative, not a clinical standard |
| `baseline_end` | start of a local calendar day, exclusive baseline cutoff | supervisor selects an earlier, comparable period believed to be stable |
| `selected_priority` | one category present in the data | supervisor chooses which service category to review |

Response time is `(on_scene_at - dispatched_at)` in minutes. A response is late only when its time is strictly greater than the selected target. Convert offset-aware timestamps to `America/New_York` for daily grouping by dispatch date, and show this timezone in the interface. Changing the target, priority or baseline starts a new analysis; new monitoring observations never silently update an existing baseline.

Each analysis records an `as_of` timestamp, injectable in tests and fixed in demo instructions. The current local calendar day is provisional: show its observed rate and counts, but issue no formal control verdict until the day has ended. Reject timestamps later than `as_of`. Day closure does not establish that every response is complete or logged; keep record-coverage limitations visible. Historical additions or corrections trigger an explicitly labeled new analysis rather than silently changing a prior verdict.

The first version analyzes completed responses. Missing arrival times, malformed or reversed timestamps, duplicate IDs and missing required fields are explicitly reported and excluded from statistical denominators. The page shows their counts and the usable-record coverage; no usable observations means no result, not zero delay. This is not a measure of all calls, cancellations, or currently outstanding responses.

## 4. The statistics, and why (rubric: valid QC analysis 25)
Say the method in words before any code exists. Load the `stats-first-steering` skill first.
- **Method:** For each zone within the selected priority, use a daily p control chart of late completed responses. Estimate `p_bar = total baseline late responses / total baseline completed responses` using only records dispatched before `baseline_end`. For each later day with `n` usable responses, plot `p = late / n` against `LCL = max(0, p_bar - 3*sqrt(p_bar*(1-p_bar)/n))` and `UCL = min(1, p_bar + 3*sqrt(p_bar*(1-p_bar)/n))`. Flag only strict crossings: above UCL means a high-late-rate signal; below LCL means a low-late-rate signal. No additional run rules. Reference: [NIST proportions control charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm).
- **Why it fits the use case:** A completed response either meets the selected operational target or exceeds it; a p chart monitors changes in that proportion while allowing daily sample sizes to differ. The operational target defines lateness; the statistical limits indicate change from a zone's baseline. Individual late incidents are not automatically statistical outliers, and baseline-relative signals are not a raw ranking of zone quality.
- **Assumptions and how the tool checks them:** The baseline must be reasonably stable and comparable to monitoring, with approximately independent responses and a common underlying probability within each zone/priority group. Display daily baseline rates, sample sizes and a day-of-week breakdown so the supervisor can check for shifts, periodicity or changing case mix; these displays do not prove independence. Clearly label an unreviewed baseline as provisional. This app requires at least 20 nonempty baseline days per zone as a chosen minimum-data policy. Use the normal-approximation limits only for groups with `n*p_bar >= 5` and `n*(1-p_bar) >= 5`; otherwise show the observed rate with an insufficient-data label and no control signal. A baseline rate of 0 or 1, a new zone without a baseline, or a day with no observations also receives no control verdict. Missing-record coverage is always visible because exclusions can bias completed-response rates. No capability indices, predictive risk scores or causal claims.
- **Known-answer check:** A fixed baseline with 200 late responses out of 2,000 completed responses over 20 days gives `p_bar = 0.10`. A monitoring day of 100 completed responses has LCL `0.01` and UCL `0.19`; 20 late responses signal high, while 19 are exactly on the limit and do not signal. A day of 400 responses has limits `0.055` and `0.145`. Verify the weighted baseline under unequal daily sample sizes, a response exactly at the target, and that adding monitoring records never changes baseline limits. Handle floating-point equality consistently. Degenerate tests cover no data, one record, all-on-time/all-late baselines, missing or reversed timestamps, duplicate IDs, unknown zones and absent baseline groups.

Fixed for every team:
- The statistic lives in **one plain, tested function** (`app/qc.py` or `app/qc.R`). The API, app or
  package only calls it and displays the result. No statistics inside UI code.
- Every statistic has a test against a known answer and a degenerate case (constant data, n = 1, missing values).
- You can explain every number the tool prints. If you cannot, it is not done.

## 5. Delivery (rubric: working tool 25)
- **Stack:** Dashboard / web app with a Python FastAPI backend and a React (Vite) front end.
- **Starting demo:** Copy `demos/fastapi/` into `app/`; add the React front end under `app/frontend/` following the `fastapi-react-scaffold` skill. Keep the core statistics in `app/qc.py`.

Fixed for every team:
- Start from **one** demo in `demos/`, copied to `app/`. Keep its four-script contract
  (`testme`, `manifestme`, `deployme`, `README.md`); `testme` starts the tool with one command.
- Deployed on the course **Posit Connect** server with a public URL (publisher key handed out at the
  event). Deploy early: copy one workflow from
  [`.claude/skills/connect-publish/workflows/`](.claude/skills/connect-publish/workflows/).
- A small tool that runs beats a large tool that does not.

## 6. Outputs
- **What the user sees:** A React dashboard with CSV import and single-completed-response entry; priority/zone filters, an operational-target input and a baseline cutoff; a daily late-rate p chart with sample sizes, frozen baseline and limits; a list of zones/days requiring review; and a sortable table of late completed incidents with response times in minutes. Show usable/excluded record counts and explicit insufficient-data messages. Each view includes a short interpretation, including that a stable rate can still miss the operational target. CSV data are held in the current session; export the current records for reuse. Statistics come from `app/qc.py` through FastAPI, never from JavaScript.

## 7. Test datasets and codebook (rubric: demo 10, datasets 5, codebook 5)
2-3 small CSVs in `data/`, invented but shaped like real field data, each showing one behavior.
`data/README.md` is the codebook: every file, every column with units, and what it would take to
collect this data for real.
- **Datasets:** `stable.csv` contains a designated baseline plus monitoring records with unchanged generating conditions; `zone_shift.csv` uses the same baseline and adds a documented deterioration in one zone during monitoring; `edge_cases.csv` demonstrates missing/invalid records and insufficient or degenerate groups. All are explicitly synthetic, use reproducible random seeds where randomness is used, and have the five incident columns listed above. The codebook records units, timezone, generating assumptions, baseline cutoff, illustrative target, priority labels and planted changes. An unchanged random process can still produce a false alarm; do not select seeds just to force a clean chart. Exact expected outputs will be recorded only after the statistical implementation is verified.

## 8. Documentation and reproducibility (rubric: docs 10, public repo 5)
- `README.md` says what the tool does, for whom, every input and parameter, how to run it in one
  command, and walks through the demo on each test dataset.
- Public GitHub repo; a fresh clone runs `testme` and the tests pass with no extra steps.
- Submit on Devpost: the repo link plus a demo.

## 9. Out of scope
What we will NOT build, so nobody (human or agent) builds it by accident.
- Default: logins, databases, real customer data, a second statistic before the first one is tested.
- No live 911 integration, patient-identifying data, maps or route optimization, automatic ambulance assignment, clinical triage, causal explanation of delays, mortality predictions, or remaining-time predictions for open incidents. No accounts or persistent database in the first version. The tool supports operational review of completed responses and does not make clinical decisions.

## 10. Optional live simulation (authorized extension, H-09)
- A separate, explicitly synthetic session streams seeded random completed-response records through the existing real `/analyze` API. Imported CSV sessions remain separate. This is a demonstration data stream, not a connection to an ambulance service.
- Initialize 20 fixed baseline days for zones A and B, priority P1, with 100 responses per zone per day; the illustrative operational target is 10 minutes. The baseline cutoff is September 21, 2026, New York time. Its records and reviewed-zone confirmations remain fixed while monitoring records append.
- A simulation step advances the clock by six hours and adds 25 completed responses per zone, with unique IDs and arrival timestamps no later than the simulated observation time. Cap a run at 10 monitoring days (40 steps, 6,000 total records). No future observation time is sent to the API.
- The user can initialize/reset with a seed, start/pause, advance one step, adjust playback speed, and switch future records between normal conditions and a higher late probability in zone A. A scenario switch never rewrites earlier records. Export includes synthetic provenance and scenario metadata.
- Baselines start unreviewed. The existing review controls and statistical rules still apply: the unfinished simulated day is provisional; only closed days with usable, reviewed baselines may receive a formal signal. All rates, control limits and verdicts still come from `app/qc.py`.
- Serialize updates, pause on navigation or service failure, retain the last successful result with an explicit error if a request fails, and ignore stale responses after reset. Record generation is bounded and reproducible; it must never silently replace a failed API call with precomputed output.

## 11. Stakeholder reliability follow-up (authorized H-10)
- Reject malformed CSV quoting, ambiguous headers and records with the wrong field count before replacing the current session. Explicit empty cells and all extra columns remain available for server-side record-quality checks and export.
- Preserve the selected zone/date when moving between the chart and incident review. Switching zones keeps the date even when there are no matching incidents. Keyboard navigation moves focus to the destination content and returns it to the chart action.
- Chart ranges count **observed dates**, with the actual start/end dates and calendar span stated. Horizontal positions follow calendar spacing; missing dates and unavailable rates break rate lines and control-limit shading. Missing observations are never plotted as zero or assigned a verdict.
- Every ordinary page identifies built-in synthetic examples, public historical data, or user uploads of unverified origin. API calculation mode is a separate label. Manually edited records have mixed/unverified provenance; provenance imported from JSON is explicitly a declaration, not verified origin.
- CSV export contains records only. A separate versioned analysis JSON includes raw records and extra columns, source/provenance, analyzed priority/target/baseline cutoff, exact offset-aware `as_of`, timezone, recorded baseline confirmations and selected zone/date. Import validates the snapshot and recomputes through the real API before replacing the session. Parse errors, rejected parameters and API failures retain the prior session. No stored statistical result is trusted. Ordinary analysis JSON and simulation replay settings are distinct formats.
- Preserve existing styling, colors and layout. These are functional repairs and explanatory labels, not the proposed UI redesign. Local tests and browser evidence must pass before requesting check-in or publication.
