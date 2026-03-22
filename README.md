# Auto Code

A Windows desktop application that fetches Jira issues, generates Java Spring Boot code using OpenAI / Claude / Gemini via an n8n workflow, displays results in a tabbed code viewer, and lets you download or post them back to Jira — all without touching your repository.

---

## Architecture

```
┌─────────────────────────┐
│  Desktop UI             │   Electron 28 + React 18 + Redux Toolkit
│  (renderer process)     │
└────────────┬────────────┘
             │ IPC (contextBridge)
┌────────────▼────────────┐
│  Main process (Node.js) │   electron-store · axios · fs · dialog
└────────────┬────────────┘
             │ HTTP (localhost:5678)
┌────────────▼────────────┐
│  n8n Workflow Engine    │   Runs locally on Windows
└──────┬──────────────────┘
       │                   │
  Jira REST API       OpenAI API
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
│   │       ├── App.jsx
│   │       ├── index.jsx
│   │       ├── components/
│   │       │   ├── Layout.jsx
│   │       │   ├── Dashboard.jsx     ← Jira issue list
│   │       │   ├── TaskDetail.jsx    ← Issue detail + Generate button
│   │       │   ├── ResultScreen.jsx  ← Code viewer + actions
│   │       │   ├── CodeViewer.jsx    ← Prism.js syntax highlighter
│   │       │   ├── Settings.jsx
│   │       │   ├── Loader.jsx
│   │       │   └── ErrorBoundary.jsx
│   │       ├── services/
│   │       │   ├── n8n.service.js    ← POST to n8n webhook
│   │       │   └── file.service.js   ← ZIP + PATCH download
│   │       ├── store/
│   │       │   ├── index.js
│   │       │   ├── issuesSlice.js
│   │       │   └── settingsSlice.js
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
- Lists Jira issues using the JQL query shown in the search bar.
- Edit the JQL and press **Refresh** or hit `Enter` to re-query.
- Click any issue card to open its detail view.

### Task Detail
- Shows the full issue: title, description, assignee, comments.
- Press **🤖 Generate Code** to send the issue to n8n + OpenAI.
- Generation typically takes 30–90 seconds depending on complexity.

### Result Screen
- **Summary** — one-sentence description of what the AI implemented.
- **Files panel** — click a file name to jump to it in the viewer.
- **Tab bar** — switch between generated files; a `patch.diff` tab appears if a diff was returned.
- **📦 Download ZIP** — saves all files in a single archive via a native Save dialog.
- **🔀 Download PATCH** — saves the unified diff to a `.diff` file; apply with `git apply patch.diff`.
- **📨 Send to Jira** — posts a comment to the original issue summarising the generated files.

### Git Panel
- Lists quick-action buttons: Status, Log, Diff (staged), Diff (unstaged), Branches, Stash list.
- **Commit form** — optionally stages all changes (`git add -A`) then commits with your message.
- **Apply AI Patch** — saves the generated diff to a location you choose, then runs `git apply` against the repo.
- **Dry-run check** — runs `git apply --check` to verify the patch applies cleanly before touching any files.
- **Custom command** — type any git subcommand; `push` (and variants like `send-pack`) are blocked at the IPC layer.

---

## Git Policy

| Operation | Allowed |
|-----------|---------|
| `git status`, `diff`, `log`, `show` | ✅ |
| `git add`, `git commit` | ✅ |
| `git branch`, `git checkout`, `git merge`, `git rebase` | ✅ |
| `git stash`, `git apply`, `git reset` | ✅ |
| `git tag`, `git cherry-pick` | ✅ |
| **`git push`** (any remote write) | ❌ Blocked |
| `git send-pack`, `git push-pack`, `--mirror` | ❌ Blocked |

---

## n8n Workflow — Node-by-Node

| # | Node | Purpose |
|---|------|---------|
| 1 | **Webhook** | Receives `POST /webhook/generate` |
| 2 | **Validate & Prepare** | Checks required fields; builds Basic-Auth header |
| 3 | **Fetch Jira Issue** | `GET /rest/api/3/issue/:key` via HTTP Request |
| 4 | **Build AI Prompt** | Extracts text from ADF; constructs structured prompt |
| 5 | **Call OpenAI** | `POST /v1/chat/completions` (model: `gpt-4o`) |
| 6 | **Parse AI Response** | Strips markdown fences; validates JSON shape |
| 7 | **Respond to Webhook** | Returns `{ summary, files, patch }` as JSON |
| 8 | **Error Handler** | Catches failures; returns 500 with error message |

To use a different model (e.g. `gpt-4-turbo`, `gpt-3.5-turbo`), edit node **5 — Call OpenAI** and change the `model` field in the JSON body.

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
- The repository is **read-only**: no git operations are performed at any point.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| "No issues found" even with correct credentials | Verify the JQL query; try `project is not EMPTY ORDER BY updated DESC` |
| "Code generation failed. Is n8n running?" | Start n8n (`npx n8n`) and ensure the workflow is **Active** |
| 500 error from n8n | Open n8n UI → Executions → inspect the failed run for details |
| OpenAI timeout | Large tasks may exceed the free-tier rate limit; try a smaller, scoped ticket |
| Blank window on startup | Run `npm run dev` (not `npm start`) and check the DevTools console |

---

## Limitations

- AI output requires **manual developer review** before use in production.
- **`git push` to remote is disabled** — no code leaves your machine automatically. All other local git operations (commit, branch, stash, apply, merge, rebase, etc.) are fully supported via the Git panel.
- Large Jira descriptions may be truncated by the OpenAI token limit — keep tickets focused.
- `patch.diff` is AI-generated and may not apply cleanly to an existing codebase — always run a dry-run check first.

---

## Roadmap

- [ ] Inline diff viewer (side-by-side)
- [ ] AI code review pass (second prompt)
- [ ] RAG / multi-file context (provide existing files to the AI)
- [ ] Support for Claude / Gemini models
- [ ] Slack notification on generation complete
