# Auto Code

A Windows desktop application for AI-assisted software development. It connects to Jira, triggers multi-provider AI code generation (OpenAI / Claude / Gemini) through an n8n workflow, and presents results in a production-ready 5-tab UI with a Kanban board, workflow builder, generation history, and interactive charts — all without touching your repository.

> **v1.2.0** — Full UI redesign: 5-tab layout · Dashboard with recharts analytics · Kanban board · Workflow builder · Generation history · Zustand state persistence

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Desktop UI  (Electron 28 + React 18)                │
│                                                      │
│  Dashboard │ Kanban │ Workflows │ History │ Settings  │
│                                                      │
│  Redux Toolkit  ─────────────────── Zustand          │
│  (issues, ai, git, settings)       (stats, workflows,│
│                                     history)         │
└────────────┬─────────────────────────────────────────┘
             │ IPC (contextBridge)
┌────────────▼────────────┐
│  Main process (Node.js) │   electron-store · axios · fs · dialog
└────────────┬────────────┘
             │ HTTP (localhost:5678)
┌────────────▼────────────┐
│  n8n Workflow Engine    │   Runs locally on Windows
└──────┬──────────────────┘
       │                        │
  Jira REST API       AI API (OpenAI / Claude / Gemini)
```

---

## Project Structure

```
auto_code/
├── docs/
│   └── technical-design-document.md
├── n8n-workflows/
│   └── generate-code.workflow.json   ← import this into n8n
├── ui/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.js              ← Electron main process
│   │   │   └── preload.js            ← contextBridge API
│   │   └── renderer/
│   │       ├── App.jsx               ← routes (5 tabs)
│   │       ├── index.jsx
│   │       ├── components/
│   │       │   ├── Layout.jsx        ← sidebar nav
│   │       │   ├── Dashboard.jsx     ← analytics + charts
│   │       │   ├── KanbanBoard.jsx   ← Jira issue board
│   │       │   ├── TaskDrawer.jsx    ← issue detail + generate
│   │       │   ├── WorkflowsTab.jsx  ← workflow builder
│   │       │   ├── HistoryTab.jsx    ← generation history
│   │       │   ├── ResultScreen.jsx  ← code viewer + actions
│   │       │   ├── Settings.jsx
│   │       │   └── StepProgress.jsx
│   │       ├── services/
│   │       │   ├── n8n.service.js    ← POST to n8n webhook
│   │       │   └── file.service.js   ← ZIP + PATCH download
│   │       ├── store/
│   │       │   ├── index.js          ← Redux store
│   │       │   ├── issuesSlice.js
│   │       │   ├── aiSlice.js
│   │       │   ├── gitSlice.js
│   │       │   ├── settingsSlice.js
│   │       │   └── appStore.js       ← Zustand (stats/workflows/history)
│   │       └── styles/
│   │           └── global.css
│   ├── .env.example
│   ├── package.json
│   └── webpack.renderer.config.js
└── README.md
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 LTS | https://nodejs.org |
| npm | ≥ 9 | bundled with Node |
| n8n | latest | `npm install -g n8n` |
| Git | any | https://git-scm.com |

---

## Setup

### 1 — Install UI dependencies

```powershell
cd ui
npm install
```

### 2 — Start n8n

Open a **separate terminal** and run:

```powershell
npx n8n
# or, if installed globally:
n8n
```

n8n will start at **http://localhost:5678**.  
Create a free account when prompted (local account, no cloud required).

### 3 — Import the n8n workflow

1. Open **http://localhost:5678** in a browser.
2. Go to **Workflows → Import from file**.
3. Select `n8n-workflows/generate-code.workflow.json`.
4. Click **Save** then **Activate** (toggle in the top-right).

The webhook is now live at:
```
POST http://localhost:5678/webhook/generate
```

### 4 — Configure credentials in the app

Start the app (see next step), then open **Settings** and fill in:

| Field | Value |
|-------|-------|
| Jira Base URL | `https://yourcompany.atlassian.net` |
| Email | Your Atlassian account email |
| API Token | Token from id.atlassian.com → Security → API tokens |
| OpenAI API Key | From platform.openai.com |
| Claude API Key | From console.anthropic.com (optional) |
| Gemini API Key | From aistudio.google.com (optional) |
| n8n URL | `http://localhost:5678` (default) |

All values are stored locally via `electron-store` (never sent anywhere except the APIs you configure).

### 5 — Run in development mode

```powershell
cd ui
npm run dev
```

This starts webpack in watch mode and launches Electron with DevTools open.

### 6 — Build a distributable `.exe`

```powershell
cd ui
npm run build
```

The installer is written to `ui/release/`.

---

## Usage

### Dashboard
- **Stat cards** — total tasks, in-progress, AI-generated, completed counts.
- **Bar chart** — tasks breakdown by status (Done / In Progress / To Do / Review).
- **Line chart** — AI generations per day over the last 7 days.
- **AI Activity panel** — today's generation count, success/failed statistics, average generation time, success-rate progress bar.
- **Recent Tasks** — last 8 issues from Jira, click any row to jump to the Kanban board.
- **Quick Actions** — one-click navigation to Fetch Jira, Kanban, Workflows, History.

### Kanban Board
- Draggable cards organised by status column (To Do / In Progress / Review / Done).
- Click any card to open the **Task Drawer** on the right.
- Cards show issue key, priority badge, assignee, and comment count.

### Task Drawer
The drawer has four sub-tabs:

| Tab | Contents |
|-----|----------|
| **Overview** | Full issue title, metadata (priority / status / assignee / type), description, comments |
| **Generate** | AI provider selector, task type, repos, language, generate button, live step progress |
| **Files** | Generated source files with syntax-highlighted code viewer, Download ZIP |
| **Patch** | Unified diff output, Download `.patch` file |

On successful generation the drawer automatically switches to the **Files** tab and records an entry in History and the Dashboard stats.

### Workflows
- View and manage AI generation workflows (Code Generation, Bug Fix, Code Review, Test Generation — and any custom ones).
- Each workflow has configurable **steps** with editable labels and prompt templates.
- Reorder steps with ↑/↓ buttons; add or remove steps freely.
- Toggle a workflow active/inactive; override its n8n webhook URL.
- Create new workflows from the **+ New Workflow** button.

### History
- Full log of every AI generation run (issue key, task type, language, file count, success/failure, timestamp).
- **Search** by issue key or summary; **filter** by task type.
- Click any entry to see the full detail: summary, generated files, patch diff.
- **Export** any entry as JSON; **Clear All** with confirmation guard.

### Settings
- **Jira** — base URL, email, API token (+ Test Connection).
- **AI Providers** — default provider; per-provider API key and model picker (OpenAI / Claude / Gemini).
- **n8n** — webhook base URL.
- **Local Repository** — folder path picker for git panel operations.

---

## State Management

| Store | Library | Persisted | Contents |
|-------|---------|-----------|----------|
| Redux Toolkit | Redux | electron-store | Jira issues, AI generation state, git state, settings |
| appStore | Zustand | localStorage | Dashboard stats, workflows (CRUD), generation history |

---

## n8n Workflow — Node-by-Node

| # | Node | Purpose |
|---|------|---------|
| 1 | **Webhook** | Receives `POST /webhook/generate` |
| 2 | **Validate & Prepare** | Checks required fields; builds Basic-Auth header |
| 3 | **Fetch Jira Issue** | `GET /rest/api/3/issue/:key` via HTTP Request |
| 4 | **Build AI Prompt** | Extracts text from ADF; constructs structured prompt |
| 5 | **Call AI** | Routes to OpenAI / Claude / Gemini based on `provider` field |
| 6 | **Parse AI Response** | Strips markdown fences; validates JSON shape |
| 7 | **Respond to Webhook** | Returns `{ summary, files, patch }` as JSON |
| 8 | **Error Handler** | Catches failures; returns 500 with error message |

---

## Environment Variables (optional)

The app stores credentials in `electron-store` (encrypted on disk).  
You can also pre-set defaults via a `.env` file — copy `.env.example` and fill in values.  
`.env` is **git-ignored** and never committed.

---

## Security Notes

- All API credentials are stored locally in `electron-store` — never transmitted to any third party.
- n8n is restricted to `localhost` by default (`--tunnel` is off).
- The Electron renderer uses `contextIsolation: true` and `nodeIntegration: false`; only the explicitly exposed `electronAPI` surface is available to React code.
- The repository is **read-only from a remote perspective**: `git push` is blocked at the IPC layer.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "No issues found" even with correct credentials | Verify the JQL query; try `project is not EMPTY ORDER BY updated DESC` |
| "Code generation failed. Is n8n running?" | Start n8n (`npx n8n`) and ensure the workflow is **Active** |
| 500 error from n8n | Open n8n UI → Executions → inspect the failed run for details |
| OpenAI timeout | Large tasks may exceed the free-tier rate limit; try a smaller, scoped ticket |
| Blank window on startup | Run `npm run dev` (not `npm start`) and check the DevTools console |
| Charts not rendering | Ensure `recharts` is installed (`npm install` in `ui/`) |

---

## Limitations

- AI output requires **manual developer review** before use in production.
- **`git push` to remote is disabled** — no code leaves your machine automatically.
- Large Jira descriptions may be truncated by the AI token limit — keep tickets focused.
- `patch.diff` is AI-generated and may not apply cleanly to an existing codebase — always run a dry-run check first.

---

## Roadmap

- [x] Multi-provider AI (OpenAI / Claude / Gemini)
- [x] Kanban board with drag-and-drop
- [x] Task Drawer with Overview / Generate / Files / Patch sub-tabs
- [x] Workflow builder with step-level prompt editing
- [x] Generation history with search and export
- [x] Dashboard analytics (recharts bar + line charts)
- [x] Zustand persistent state (stats / workflows / history)
- [ ] Inline diff viewer (side-by-side)
- [ ] RAG / multi-file context (feed existing source files to the AI)
- [ ] Slack / Teams notification on generation complete
- [ ] Dark / light theme toggle

