# 📄 TECHNICAL DESIGN DOCUMENT

## Auto Code (Windows UI + n8n + Jira + Multi-Provider AI + Copilot CLI)

> **Last Updated:** March 22, 2026
> **Status:** ✅ Implemented & Buildable

---

# 1. 🎯 Objective

Build a **Windows desktop application** that:

- Fetches tasks from Jira
- Uses **multiple AI providers** (OpenAI GPT-4o, Anthropic Claude, Google Gemini) to generate code
- Provides a **GitHub Copilot CLI** integration panel for on-demand suggestions
- Displays results in UI with **step-by-step generation progress**
- Allows:
  - Download code (ZIP)
  - Download patch (diff)
  - Send result back to Jira
  - Apply patch via local Git integration

---

# 2. 🧱 System Architecture

```
+------------------------------------+
|   Desktop UI (Electron 28 + React) |
|                                    |
|  Dashboard | AI Panel | Git | Settings
+--------+-----------+---------------+
         |           |               |
         | Webhook   | IPC           | IPC
         v           v               v
  +------------+  +----------+  +---------+
  |   n8n      |  | ai:quick |  | cli:run |
  | (Workflow) |  |  Ask IPC |  | (gh CLI)|
  +-----+------+  +-----+----+  +---------+
        |               |
        v               v
  +-----+---------+--+--+------------+
  | OpenAI GPT-4o | Claude 3.5 | Gemini Pro |
  +--------------++------------+------------+
        |
        v
  +------------+
  |   Jira     |
  | REST API   |
  +------------+
```

### Data Flow

| Path | Purpose |
|------|---------|
| UI → n8n webhook | Full code generation (fetches Jira + calls AI) |
| UI → `ai:quickAsk` IPC → AI API | Direct quick questions (no n8n overhead) |
| UI → `cli:run` IPC → `gh copilot` | GitHub Copilot CLI suggestions/explanations |
| UI → `git:run` IPC → `git` | Local git operations (push blocked) |

---

# 3. 🧩 Components

---

## 3.1 Desktop UI Application

### Technology Stack

| Layer | Technology |
|-------|------------|
| Shell | Electron 28 (Chromium renderer + Node main) |
| UI | React 18 + React Router v6 (HashRouter) |
| State | Redux Toolkit (issues, settings, git, ai slices) |
| Build | Webpack 5 + Babel (JSX, async/await) |
| Storage | `electron-store` (encrypted local settings) |
| HTTP | `axios` |
| Icons | Emoji-native (no icon library dependency) |

### Pages / Routes

| Route | Component | Purpose |
|-------|-----------|----------|
| `/` | Dashboard | Jira issue list |
| `/issue/:key` | TaskDetail | Issue detail + Generate Code button + step progress |
| `/issue/:key/result` | ResultScreen | Code viewer, ZIP/PATCH download, Jira comment |
| `/ai` | AiPanel | Quick Ask (multi-provider) + Copilot CLI |
| `/git` | GitPanel | Local git operations |
| `/settings` | Settings | All configuration |

### Responsibilities

- Display Jira issues
- Trigger AI generation with step-by-step progress UI
- Render code results with syntax highlighting (Prism.js)
- Download generated code as ZIP or PATCH
- Send comments back to Jira
- Local git panel (all ops except push)
- Multi-provider AI quick-ask
- GitHub Copilot CLI integration

---

## 3.2 Workflow Engine

- **Tool:** n8n
- Runs locally on Windows

### Responsibilities

- Handle API requests from UI
- Call Jira API
- Call AI API
- Process output

---

## 3.3 Jira Integration

- **Tool:** Jira

### Responsibilities

- Provide tasks
- Receive comments / attachments

---

## 3.4 AI Service — Multi-Provider

| Provider | Models | Key Setting | Use Case |
|----------|--------|-------------|----------|
| OpenAI | GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo | `openaiKey` | Default; best code quality |
| Anthropic Claude | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | `claudeKey` | Long-form reasoning, large context |
| Google Gemini | Gemini 1.5 Pro, Gemini 2.0 Flash, Gemini 1.5 Flash | `geminiKey` | 1M token context, fast |
| GitHub Copilot CLI | `gh copilot suggest/explain` | `gh` auth login | CLI command suggestions |

### Provider selection
- **Default provider** is configured in Settings and used by n8n code generation
- **Quick Ask** in AI Panel lets the user pick any configured provider on the fly
- **Copilot CLI** is always `gh` — only requires `gh auth login`

### Responsibilities

- Convert Jira task description → production Spring Boot code
- Generate:
  - Java source files (Controller → Service → Repository)
  - JUnit 5 unit tests (Mockito)
  - Unified diff patch file
- Answer ad-hoc developer questions (Quick Ask)
- Suggest CLI commands (Copilot CLI)

---

# 4. 🖥️ UI Design

---

## 4.1 Dashboard

```
------------------------------------------------
| JIRA-123 | Create Order API   | [Generate]   |
| JIRA-124 | Fix Payment Bug    | [Generate]   |
------------------------------------------------
```

---

## 4.2 Task Detail

```
Title: Create Order API
Priority: Medium  |  Status: In Progress  |  Assignee: John

Description:
...

Using 🧠 OpenAI • gpt-4o

[ 🤖 Generate Code ]

--- Step Progress (shown while generating) ---
  ✓  Connecting to n8n
  ✓  Fetching Jira issue details
  ✓  Analysing requirements
  ◯  Planning architecture          ← current
  ○  Generating source files
  ○  Writing unit tests
  ○  Building diff patch
  ○  Finalising output
```

---

## 4.3 Result Screen

```
---------------------------------------
Summary:
- Added POST /orders API

Files:
- OrderController.java
- OrderService.java

Tabs:
[Controller] [Service] [Test]

Actions:
[Download ZIP] [Download PATCH] [Send to Jira]
---------------------------------------
```

---

## 4.4 Settings

| Section | Fields |
|---------|--------|
| Jira | Base URL, Email, API Token (+ Test Connection button) |
| AI Providers | Default provider selector; per-provider API key + model picker for OpenAI / Claude / Gemini |
| n8n | Webhook base URL (default: `http://localhost:5678`) |
| Local Repository | Repo path (folder picker), used by Git panel |

> API keys are stored via `electron-store` — encrypted on disk, never sent to any third party except the selected AI provider.

---

## 4.5 Git Panel

```
---------------------------------------
Repo: C:\projects\my-service

[ Status ] [ Log ] [ Diff ] [ Branches ]

Commit:
  [ Stage all ☑ ]  Message: ____________
  [ Commit ]

Apply AI Patch:
  [ Save & Apply ]  [ Dry-run Check ]

Custom: git ________________________ [ Run ]

Output:
  $ git status
  On branch feature/order-api
  nothing to commit, working tree clean
---------------------------------------
⚠️  git push is DISABLED (no remote writes)
---------------------------------------
```

### Git Security Policy

| Command | Allowed? |
|---------|----------|
| `git status`, `log`, `diff`, `branch` | ✅ Yes |
| `git commit`, `add`, `stash`, `checkout` | ✅ Yes |
| `git apply`, `merge`, `rebase`, `reset` | ✅ Yes |
| `git push` | ❌ **Blocked** |
| `git push-pack`, `git send-pack`, `--mirror` | ❌ **Blocked** |

## 4.6 AI Panel

```
🧠 OpenAI ● | 🤖 Claude ○ | ✨ Gemini ●

[ 💬 Quick Ask ]   [ 🐙 Copilot CLI ]

--- Quick Ask Tab ---
Provider: ● OpenAI  ○ Claude  ✨ Gemini
Model:    [gpt-4o ▾]

Question: ________________________________
         ________________________________

[ 💬 Ask ]

Response:
  Here is how to structure a Spring Boot
  service layer...
  ```java
  @Service
  public class OrderService { ... }
  ```

--- Copilot CLI Tab ---
[ suggest ]  [ explain ]
Target: [ shell ] [ git ] [ gh ]

$ gh copilot suggest _________________ [ ▶ Run ]

Output:
  $ gh copilot suggest "list java files"
  > find . -name "*.java"
```

---

# 5. 🔄 Workflow

---

## Step 1 — UI Request

```
POST http://localhost:5678/webhook/generate
```

**Body:**

```json
{
  "issueKey": "JIRA-123",
  "jiraUrl": "https://company.atlassian.net",
  "jiraEmail": "dev@company.com",
  "jiraToken": "...",
  "provider": "openai",
  "model": "gpt-4o",
  "openaiKey": "sk-...",
  "claudeKey": "",
  "geminiKey": ""
}
```

---

## Step 2 — n8n Workflow (9 nodes)

```
Webhook
→ Validate & Prepare   (validates + builds Jira basicAuth)
→ Fetch Jira Issue     (HTTP GET to Jira REST API)
→ Build AI Prompt      (extracts ADF text, builds prompt)
→ Call AI Provider     (Code node — routes to OpenAI/Claude/Gemini via fetch())
→ Parse AI Response    (strips fences, JSON.parse, validates shape)
→ Respond to Webhook   (returns { summary, files[], patch })
```

Error path: any node failure → **Error Handler** → **Respond Error** (HTTP 500)

---

## Step 3 — AI Prompt

```
You are a senior Java Spring Boot developer.
Return ONLY a valid JSON object — no markdown, no code fences.

Task: {{summary}}

Description:
{{description}}

Requirements:
- Spring Boot 3.x, clean architecture (Controller → Service → Repository)
- Jakarta Validation (@Valid)
- GlobalExceptionHandler
- Javadoc / inline comments
- JUnit 5 + Mockito unit tests for service layer

Return shape:
{
  "summary": "one-sentence description",
  "files": [
    { "name": "src/main/java/.../Controller.java", "content": "..." }
  ],
  "patch": "unified diff or empty string"
}
```

### n8n Provider Routing (Call AI Provider node)

```js
if (provider === 'claude')       → POST api.anthropic.com/v1/messages
else if (provider === 'gemini')  → POST generativelanguage.googleapis.com/...
else                             → POST api.openai.com/v1/chat/completions
```

---

## Step 4 — Step Progress (client-side)

While the n8n call is in-flight, the UI fires timers at fixed intervals to simulate progress:

| Step | Label | Simulated delay |
|------|-------|-----------------|
| 0 | Connecting to n8n | 0.6 s |
| 1 | Fetching Jira issue details | 3 s |
| 2 | Analysing requirements | 5.5 s |
| 3 | Planning architecture | 9 s |
| 4 | Generating source files | 16 s |
| 5 | Writing unit tests | 22 s |
| 6 | Building diff patch | 27 s |
| 7 | Finalising output | 31 s |

## Step 5 — UI Rendering

- Parse `{ summary, files[], patch }` from n8n response
- Display in ResultScreen:
  - Summary badge
  - File list with per-file code viewer (Prism.js)
  - Download ZIP / Download PATCH buttons
  - Send to Jira comment button

---

# 6. 📁 File Handling

---

## ZIP Download

- Combine files into archive

---

## PATCH Download

- Save `.diff` file

---

## Apply Patch (Dev Side)

```bash
git apply patch.diff
```

---

# 7. 🔁 Jira Integration (Optional)

---

## Send Comment

```
POST /rest/api/3/issue/{issueKey}/comment
```

---

## Attach Files

```
POST /issue/{issueKey}/attachments
```

---

# 8. 🪟 Windows Deployment

---

## 8.1 n8n

```bash
npx n8n
```

---

## 8.2 UI App

```bash
cd ui
npm install
npm start          # starts Electron (dev mode, DevTools on right)
```

### npm scripts

| Script | What it does |
|--------|--------------|
| `npm start` | Builds renderer + launches Electron |
| `npm run build:renderer` | Webpack-only (no Electron launch) |
| `npm run package` | electron-builder → `.exe` installer |

---

## 8.3 n8n

```bash
npx n8n           # starts n8n at http://localhost:5678
```

Then import `n8n-workflows/generate-code.workflow.json` and activate the workflow.

---

## 8.4 GitHub Copilot CLI

```bash
gh extension install github/gh-copilot
gh auth login
```

---

## 8.5 Build EXE

```bash
npm run package
```

---

# 9. 🔐 Security

| Threat | Mitigation |
|--------|------------|
| API key leakage | `electron-store` encrypted local storage; keys never logged |
| Remote code execution | `contextIsolation: true`, `nodeIntegration: false` in Electron BrowserWindow |
| n8n external exposure | n8n bound to `localhost:5678` only |
| Git push to remote | `BLOCKED_SUBCOMMANDS` set in `main/git.js` rejects push/push-pack/send-pack/--mirror |
| Shell injection | All CLI/git calls use `execFile` (never `exec`/`shell: true`); args passed as arrays |
| Prototype pollution | `settings:save` IPC validates against explicit `allowed` key list before persisting |
| SSRF | n8n webhook URL is user-controlled but bound to localhost by design |
| Prompt injection | AI output is parsed as structured JSON, not executed |

---

# 10. 🧪 Testing

---

## Case 1 — Normal Task

- Generate code → success

## Case 2 — Empty Description

- AI fallback

## Case 3 — Large Task

- Truncate or summarize

---

# 11. ⚠️ Limitations

- AI may produce incorrect logic — always requires developer review before use
- **`git push` to remote is disabled** — code never leaves the local machine automatically
- All other local git operations are fully supported (commit, branch, stash, apply, merge, rebase, etc.)
- Large Jira descriptions may be truncated by the AI model's token limit
- Generated patches may not apply cleanly to a codebase with existing changes
- GitHub Copilot CLI (`gh copilot suggest/explain`) is interactive by nature — output is captured as-is
- n8n Code nodes require n8n v1+ for `fetch()` / `await` support

---

# 12. 🚀 Future Enhancements

- Inline code diff viewer (side-by-side)
- AI-powered code review (flag issues before commit)
- Multi-file RAG context (feed existing codebase to AI)
- Slack / Teams integration
- Team collaboration (shared Jira filters)
- Streaming AI responses (SSE / WebSocket)
- Support for more AI providers (Mistral, Ollama local models)

---

# 13. 💡 Best Practices

---

## Structured Jira Ticket

```
API:
Input:
Output:
Validation:
```

---

## Limit Scope

- Small tasks only
- CRUD features

---

## Human Review

```
AI → Suggest → Developer validates → Commit
```

---

# � Project Structure

```
auto_code/
├── docs/
│   └── technical-design-document.md
├── n8n-workflows/
│   └── generate-code.workflow.json   ← import into n8n
├── ui/
│   ├── package.json
│   ├── webpack.renderer.config.js
│   ├── public/index.html
│   └── src/
│       ├── main/
│       │   ├── index.js              ← Electron main process + all IPC
│       │   ├── preload.js            ← contextBridge (renderer API surface)
│       │   ├── git.js                ← git runner (push blocked)
│       │   └── cli.js                ← gh copilot runner
│       └── renderer/
│           ├── App.jsx
│           ├── index.jsx
│           ├── constants/
│           │   └── aiProviders.js    ← provider definitions, step timings
│           ├── store/
│           │   ├── index.js
│           │   ├── issuesSlice.js
│           │   ├── settingsSlice.js
│           │   ├── gitSlice.js
│           │   └── aiSlice.js        ← startGeneration, quickAsk, copilotCli
│           ├── services/
│           │   ├── n8n.service.js
│           │   └── file.service.js
│           ├── components/
│           │   ├── Layout.jsx
│           │   ├── Dashboard.jsx
│           │   ├── TaskDetail.jsx    ← step progress
│           │   ├── ResultScreen.jsx
│           │   ├── CodeViewer.jsx
│           │   ├── AiPanel.jsx       ← Quick Ask + Copilot CLI
│           │   ├── GitPanel.jsx
│           │   ├── Settings.jsx      ← multi-provider config
│           │   ├── Loader.jsx
│           │   └── ErrorBoundary.jsx
│           └── styles/
│               └── global.css
└── README.md
```

---

# 🔥 Final Summary

This system delivers:

> ✅ Safe AI-assisted development (multi-provider: OpenAI / Claude / Gemini)
>
> ✅ Windows-native UI (Electron 28 + React 18)
>
> ✅ Jira integration (fetch tasks, post comments)
>
> ✅ Step-by-step code generation progress
>
> ✅ GitHub Copilot CLI integration
>
> ✅ Local Git panel — no push risk
>
> ✅ Security-first (contextIsolation, execFile, key allowlist)
