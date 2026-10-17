// About page: the team and who built which part. Static content only.
// Task ids and ownership follow CONTRACT.yaml and docs/team.en.md.

import shifeng from '../assets/team/shifeng.png'
import julian from '../assets/team/julian.png'
import pingchuan from '../assets/team/pingchuan.png'
import jingyao from '../assets/team/jingyao.png'
import hayden from '../assets/team/hayden.png'

const REPO = 'https://github.com/haydenYang666/SYSEN5300_hackathon'
const commit = (sha) => `${REPO}/commit/${sha}`

const MEMBERS = [
  {
    id: 'SH', photo: shifeng, name: 'Shifeng Hong', handle: 'sh942-spec', role: 'Team lead · statistics',
    focus: 'Turned the prompt into a precise method and wrote the one function every number comes from.',
    did: [
      'Product spec, interface contract (docs/interfaces.md) and the task ledger',
      'Statistics core app/qc.py: pooled baseline, per-day p-chart limits, validity gates, data-quality exclusions',
      'Known-answer and degenerate-case tests (K0–K4, D1–D3) and independent review of the backend',
      'Seeded live simulation that runs through the real API, and a supplemental synthetic bundle',
      'Fixed the seven findings from a synthetic stakeholder review (H-10)',
    ],
    commits: [['3f28f13', 'Verify core, release v1 interface'], ['8815a1b', 'Seeded live simulation'], ['6bb84fc', 'Accept datasets and codebook']],
  },
  {
    id: 'JJ', photo: julian, name: 'Julian Jiang', handle: 'Yulinjiang599', role: 'Backend · integration',
    focus: 'Put the statistics core behind a clean, validated HTTP API.',
    did: [
      'FastAPI service app/app.py: GET /health and POST /analyze with Pydantic validation',
      '422 vs 200 behaviour and the API contract tests (tests/test_api.py)',
      'Pinned dependencies and the one-command start script app/testme.sh',
      'Ran every published dataset through the live API to confirm identical numbers',
    ],
    commits: [['1a89adf', 'Implement analysis backend'], ['984ee05', 'Verify datasets through live API']],
  },
  {
    id: 'PL', photo: pingchuan, name: 'Pingchuan Liu', handle: 'pl482', role: 'Frontend · UI · demo',
    focus: 'Built the supervisor console that judges and users actually click through.',
    did: [
      'React + Vite app: Data & Settings, Zone Monitoring, Incident Review',
      'Interactive p chart, illustrative zone map, CSV import/export, baseline confirmation, light/dark themes',
      'Browser acceptance on every dataset (110/110) and against the live site',
      'Drives the live demonstration at the showcase',
    ],
    commits: [['5064507', 'Three pages against mock fixtures'], ['9d5ca9e', 'Supervisor-console dashboard'], ['921fbac', 'Example data, interactive chart']],
  },
  {
    id: 'JY', photo: jingyao, name: 'Jingyao', handle: 'Jingyao0610', role: 'Data · documentation',
    focus: 'Made the test data and wrote what a new user reads first.',
    did: [
      'Three primary synthetic datasets from a seeded, verifiable generator',
      'Data codebook: every column, its unit and how it is collected in practice',
      'Demo walkthrough (demo/README.md) and the root README',
    ],
    commits: [['e5d020e', 'Create data'], ['4a33836', 'Demo walkthrough'], ['9bd3742', 'README: access, setup, API, demos']],
  },
  {
    id: 'HY', photo: hayden, name: 'Hayden Yang', handle: 'haydenYang666', role: 'Deployment · real data · submission',
    focus: 'Got the tool live and public, and tested it on real city data.',
    did: [
      'Repository setup from the hackathon template',
      'API and web app deployed to Posit Connect with two GitHub Actions workflows',
      'Real NYC EMS dataset: 26,209 calls extracted and cleaned (rules R1–R6)',
      'Fresh-clone reproducibility check (13/13) and the Devpost submission',
    ],
    commits: [['90f2dc6', 'Real NYC EMS dataset'], ['dbf03b7', 'Deploy FastAPI to Posit Connect'], ['a08ece2', 'Deploy React to Posit Connect']],
  },
]

// AI teammates get drawn robot avatars in the same black-and-white style
// as the team portraits (not product logos).
const ROBOT_A = (
  <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="32" y1="8" x2="32" y2="16" /><circle cx="32" cy="7" r="2.6" fill="#111" />
    <rect x="16" y="16" width="32" height="26" rx="9" fill="#fff" />
    <circle cx="25.5" cy="28" r="3" fill="#111" stroke="none" /><circle cx="38.5" cy="28" r="3" fill="#111" stroke="none" />
    <path d="M26 35.5q6 4 12 0" />
    <line x1="12" y1="26" x2="16" y2="26" /><line x1="48" y1="26" x2="52" y2="26" />
    <path d="M14 60c1-9 8-14 18-14s17 5 18 14z" fill="#111" />
    <rect x="27" y="42" width="10" height="5" fill="#fff" />
  </svg>
)
const ROBOT_B = (
  <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16l-4-7M42 16l4-7" /><circle cx="17.5" cy="8" r="2.3" fill="#111" /><circle cx="46.5" cy="8" r="2.3" fill="#111" />
    <circle cx="32" cy="30" r="15" fill="#fff" />
    <rect x="21" y="25" width="22" height="9" rx="4.5" fill="#111" />
    <circle cx="27" cy="29.5" r="1.8" fill="#fff" stroke="none" /><circle cx="37" cy="29.5" r="1.8" fill="#fff" stroke="none" />
    <path d="M28 39.5h8" />
    <path d="M14 60c1-9 8-14 18-14s17 5 18 14z" fill="#fff" />
    <path d="M28 46v14M36 46v14" />
  </svg>
)

const AI_MEMBERS = [
  {
    id: 'CL', robot: ROBOT_A, name: 'Claude', ai: true, role: 'AI teammate · Claude Code',
    focus: 'Pair-programmed with Hayden on getting the tool live and on real data.',
    did: [
      'Deployment workflows and Posit Connect setup',
      'Real NYC data extraction and cleaning script',
      'Fresh-clone check, Devpost text, and these Docs and About pages',
    ],
    partners: 'Hayden',
  },
  {
    id: 'GP', robot: ROBOT_B, name: 'ChatGPT', ai: true, role: 'AI teammate · ChatGPT / Codex',
    focus: 'Pair-programmed with the rest of the team on code, tests and docs.',
    did: [
      'Drafts of the statistics core, backend and frontend code',
      'Tests written and reviewed against hand-worked answers',
      'Spec, interface contract and documentation drafts',
    ],
    partners: 'Shifeng · Julian · Pingchuan · Jingyao',
  },
]

// owner = ●, contributor = ○ ; columns follow MEMBERS order
const TASKS = [
  ['H-01', 'Spec and interface contract', ['●', '○', '○', '', '']],
  ['H-02', 'Test datasets and codebook', ['○', '', '', '●', '○']],
  ['H-03', 'Statistics core (app/qc.py)', ['●', '', '', '', '']],
  ['H-04', 'Working tool: API + web app', ['○', '●', '●', '', '']],
  ['H-05', 'Demonstration on every dataset', ['', '', '○', '●', '']],
  ['H-06', 'Deploy to Posit Connect', ['', '', '', '', '●']],
  ['H-07', 'README and function documentation', ['', '', '○', '●', '']],
  ['H-08', 'Reproducible repo, Devpost', ['', '', '', '', '●']],
  ['H-09', 'Live synthetic stream (optional)', ['●', '', '', '', '']],
  ['H-10', 'Fixes from synthetic stakeholder review', ['●', '', '', '', '']],
]

const FLOW = [
  ['Spec & interfaces', 'Shifeng', 'Agreed five input columns, function signature and JSON shape first, so everyone could work in parallel'],
  ['Data', 'Jingyao · Hayden', 'Synthetic files with known answers, then real NYC data'],
  ['Statistics core', 'Shifeng', 'One pure function, verified against hand-worked tests'],
  ['API', 'Julian', 'Wraps the core; never recomputes anything'],
  ['Web app', 'Pingchuan', 'Built against labelled mock data, then switched to the real API'],
  ['Deploy & verify', 'Hayden', 'Auto-deploy on every push; logged-out and fresh-clone checks'],
]

export default function About({ onOpenDocs }) {
  return (
    <div className="docs team">
      <header className="panel docs-hero">
        <span className="label">SYSEN 5300 Six Sigma Hackathon · Fall 2026</span>
        <h1>Team Chinese Can Fly</h1>
        <p className="docs-lead">
          Five people (and two AI teammates) built the EMS Response Monitor in parallel. Each person owned a separate part of the repository,
          tracked as tasks H-01 to H-10 in <a href={`${REPO}/blob/main/CONTRACT.yaml`} target="_blank" rel="noreferrer">CONTRACT.yaml</a>,
          and handed work over through one agreed interface.
        </p>
        <div className="docs-links">
          <a href={REPO} target="_blank" rel="noreferrer">GitHub repository</a>
          <a href={`${REPO}/commits/main`} target="_blank" rel="noreferrer">Commit history</a>
          <a href={`${REPO}/blob/main/docs/team.en.md`} target="_blank" rel="noreferrer">Work plan</a>
          <button className="link" onClick={onOpenDocs}>Project docs →</button>
        </div>
      </header>

      <div className="docs-team">
        {MEMBERS.map((m) => (
          <article key={m.name} className="panel team-card">
            <div className="team-card-head">
              <img className="team-photo" src={m.photo} alt="" width="64" height="64" />
              <div>
                <h2>{m.name}</h2>
                <div className="muted docs-role">{m.role} · <a href={`https://github.com/${m.handle}`} target="_blank" rel="noreferrer">@{m.handle}</a></div>
              </div>
            </div>
            <p className="team-focus">{m.focus}</p>
            <ul>{m.did.map((d) => <li key={d}>{d}</li>)}</ul>
            <div className="team-commits">
              <span className="label">Key commits</span>
              {m.commits.map(([sha, title]) => (
                <a key={sha} href={commit(sha)} target="_blank" rel="noreferrer"><code>{sha}</code> {title}</a>
              ))}
            </div>
          </article>
        ))}
        {AI_MEMBERS.map((m) => (
          <article key={m.name} className="panel team-card">
            <div className="team-card-head">
              <span className="team-photo team-robot" aria-hidden="true">{m.robot}</span>
              <div>
                <h2>{m.name} <span className="chip">AI</span></h2>
                <div className="muted docs-role">{m.role}</div>
              </div>
            </div>
            <p className="team-focus">{m.focus}</p>
            <ul>{m.did.map((d) => <li key={d}>{d}</li>)}</ul>
            <div className="team-commits">
              <span className="label">Paired with</span>
              <span>{m.partners}</span>
            </div>
          </article>
        ))}
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Task ownership</h2><span className="aside">● owner · ○ contributor</span></div>
        <div className="scroll docs-table">
          <table className="team-matrix">
            <thead>
              <tr><th>Task</th><th>What</th>{MEMBERS.map((m) => <th key={m.id} title={m.name}>{m.name.split(' ')[0]}</th>)}</tr>
            </thead>
            <tbody>
              {TASKS.map(([id, what, marks]) => (
                <tr key={id}>
                  <td><span className="chip">{id}</span></td>
                  <td>{what}</td>
                  {marks.map((x, i) => <td key={i} className={x === '●' ? 'own' : 'help'}>{x}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>How the work fit together</h2></div>
        <ol className="team-flow">
          {FLOW.map(([step, who, what], i) => (
            <li key={step}><span className="team-step">{i + 1}</span><b>{step}</b><span className="chip">{who}</span><span className="muted">{what}</span></li>
          ))}
        </ol>
        <p className="muted">Each person reviewed and tested their own part, including anything an AI assistant drafted, and every
          statistic is checked against hand-worked tests.</p>
      </section>
    </div>
  )
}
