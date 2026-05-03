# Workspace

## Overview

NexusOps — a comprehensive "build anything" platform like Replit. Build & host Discord bots, websites, HTML5 games, web apps, API servers, and Python scripts from the browser, powered by Agent-4 (Claude Sonnet 4.5). Cream/orange brand (#FAF7F2 / #F26207). 8-language i18n (AR default RTL, EN/ES/FR/DE/ZH/JA/RU LTR). Moyasar payments (SAR).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (used for Agent-4 conversations/messages; bots stored in data/bots.json)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **File upload**: multer

## Artifacts

- **bot-host** (`/`) — React + Vite dashboard for managing bots (dark themed)
- **api-server** (`/api`) — Express 5 REST API with bot process management

## Project Manager (formerly "Bot Manager")

- Files stored in `data/bot-files/{id}/`
- Registry persisted in `data/bots.json`; env vars in `data/bot-envs/{id}.json`
- **Project types** (`ProjectType` union, default `discord-bot`):
  - `discord-bot` — discord.js v14 / discord.py (long-running process)
  - `website` — static HTML/CSS/JS with iframe live preview
  - `game` — HTML5 Canvas games with iframe live preview
  - `web-app` — React via UMD + Tailwind CDN with iframe live preview
  - `api-server` — Express (JS) or FastAPI (Py)
  - `python-script` — automation scripts
- `isWebProject(type)` helper — true for website/game/web-app
- Web projects auto-create `index.html` if missing on registration
- JS/Python long-running types: auto-restart on crash, SSE log streaming (500-entry ring buffer)
- `POST /api/bots/create-from-code` accepts `{name, projectType, language?, code?}`; server fills starter template per type if `code` empty

## Static Preview (web/game/web-app)

- `GET /api/preview/:botId/*` serves bot's directory as static site
- MIME map for HTML/CSS/JS/SVG/PNG/etc; default → `index.html`
- Path-traversal hardened: `path.resolve` + prefix check on `dir + sep`; URL-encoded `..` blocked with 403
- Returns 400 for non-web project types

## i18n (8 languages)

- `react-i18next` + `i18next-browser-languagedetector`
- Locale files in `src/i18n/locales/{ar,en,es,fr,de,zh,ja,ru}.json`
- `LanguageSwitcher` component (globe icon dropdown with flags) in layout + home navbar
- Auto-sets `<html dir="rtl">` for AR, `dir="ltr"` for others
- Persisted to `localStorage` key `nexusops-lang`
- Translation namespaces: nav, common, home, projectTypes, dashboard, createProject, pricing, agent

## Agent-4 (generic, multi-type)

- `routes/anthropic/index.ts` — `BASE_SYSTEM_PROMPT` + `PROJECT_TYPE_PROMPTS` map (6 types)
- `buildSystemPrompt(projectType)` composes per-conversation prompt based on linked bot's type
- Detects user language; replies in same language (Arabic, English, etc.)
- Streams via SSE; existing tools (file r/w, terminal, packages) work generically across all types

## Authentication (Clerk)

- Multi-user support via `@clerk/express` (server) + `@clerk/react` (frontend)
- Keys: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- Clerk proxy mounted at `/api/__clerk` (production only)
- `clerkMiddleware()` in Express reads session cookies + Bearer tokens
- `getUserId(req)` extracts userId from auth context inline in routes
- Bot records include optional `userId` field; listBots filters by owner
- Bearer token getter set via `setAuthTokenGetter` in App.tsx for API calls
- Routes: `/` (landing), `/sign-in`, `/sign-up`, `/dashboard`, `/agent`
- Protected routes: unauthorized → `<RedirectToSignIn />`
- `bots.ts` and `bots-import-export.ts` pass userId when registering bots

## Replit-like IDE Features (per project)

- `/bots/:id/editor` — full-screen Monaco editor page
  - Monaco code editor (left)
  - **Preview tab** (web/game/web-app only): live iframe pointing to `/api/preview/:botId/`, with reload + open-in-new-tab; sandboxed `allow-scripts allow-forms allow-same-origin allow-modals allow-popups`
  - **Console tab**: SSE real-time log stream via `GET /api/bots/:id/logs/stream`
  - **Terminal tab**: xterm.js + node-pty WebSocket terminal via `wss://.../api/bots/:id/terminal`
  - **Secrets tab**: add/edit/remove KEY=VALUE env vars with show/hide toggle
  - **Packages tab**: npm/pip install panel with SSE install output stream (`POST /api/bots/:id/packages/install`)
  - Top bar: Run / Stop / Restart / Save buttons
  - Ctrl+S to save; unsaved indicator (*) on Save button
- `GET /api/bots/:id/file` + `PUT /api/bots/:id/file` — read/write bot source
- `GET /api/bots/:id/env` + `PUT /api/bots/:id/env` — read/write env vars
- Edit button (Code2 icon) added to every bot card
- In-memory ring buffer for logs (200 entries per bot)
- Bots with `autoRestart=true` resume automatically on server restart

## Agent-4 (AI Coding Agent)

- Powered by Anthropic Claude Sonnet via Replit AI Integrations
- Conversations and messages stored in PostgreSQL (`conversations`, `messages` tables)
- Streams responses via SSE (`POST /api/anthropic/conversations/:id/messages`)
- Bot context: conversations can be linked to a bot (reads bot file to give AI context)
- Deploy endpoint: `POST /api/agent/deploy` creates a new bot from AI-generated code
- Frontend: `/agent` page with sidebar conversation list, streaming chat, code block rendering, Deploy Bot button
- System prompt specialized for Discord bot development (discord.js v14 + discord.py)
- Tools: web_search, file mutations (read/write/list/create/delete), run_command, get_bot_logs, restart/start/stop_bot

## Infrastructure (Replit-grade per project)

- **Encrypted Secrets** — `lib/secrets.ts`. AES-256-GCM at rest using scrypt-derived master key from `SESSION_SECRET` (KDF salt pinned). File mode 0o600 enforced via tmp+rename. Lazy migration of legacy plain JSON. Hard-fails in production if `SESSION_SECRET` is missing/short. Endpoints: `GET/POST /api/bots/:id/secrets`, `DELETE /api/bots/:id/secrets/:key` — values never leak (only masked previews like `ab••••••••`). Bot auto-restarts when secrets change.
- **Checkpoints** — `lib/checkpoints.ts`. Per-bot git versioning via `execFile` (no shell). Auto-commits after every Agent-4 turn that touches files; manual snapshots also supported. Endpoints: `GET/POST /api/bots/:id/checkpoints`, `POST /api/bots/:id/checkpoints/:sha/restore`. Restore creates a backup commit first, then `read-tree --reset -u` + commit. Hardened against malicious `.gitconfig` injection: `HOME=/tmp`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`. Author = `Agent-4 <agent-4@nexusops.local>`.
- **Editable Files** — `PUT /api/bots/:id/files/content` (path-escape guard via `resolve()` containment + 1MB cap). Frontend Files tab uses Monaco editor (`@monaco-editor/react`) with language inferred from extension; Save button + global Ctrl/Cmd+S; dirty-dot indicator. Auto-resyncs when switching files.
- **Global File Search** — `GET /api/bots/:id/search?q=&cs=` (recursive walker, skips node_modules/.git/site-packages/.venv/etc, max 2000 files scanned, max 200 hits, 256KB/file). Frontend overlay dialog opened via Ctrl+Shift+F or tree-toolbar button; highlighted snippet, click result switches to Files tab and loads file with parent dirs auto-expanded.
- **Cost Dashboard** — `inputTokens`+`outputTokens` columns on `messages`. Anthropic stream captures `finalMsg.usage` per turn, accumulates, persists on insert, emits SSE `{type:"usage",inputTokens,outputTokens,costUsd,costSar}`. `estimateCost()` helper with env-overridable pricing (Sonnet defaults: $3 in / $15 out per 1M tokens, USD→SAR 3.75). `GET /api/anthropic/conversations/:id/usage` returns rolling totals. Frontend amber Coins badge in chat header (live-updates from SSE + refetched on conversation change).
- **NexusDB (KV store per bot)** — Replit-DB equivalent. `lib/kv-store.ts` uses `node:sqlite` (Node 24 built-in, zero-deps); one DB file per bot at `data/bot-kv/{botId}.db` with cached `DatabaseSync` instances. Routes in `routes/kv.ts`: internal token-auth at `/api/internal/kv/:botId[/:key]` (header `x-bot-kv-token`, constant-time compare) for spawned bots; user routes at `/api/bots/:id/kv[/:key]` (Clerk auth required + strict bot-owner match). Key max 512 chars, value max 1MB, prefix LIKE-escaped. `bot-manager.ts` mints a 24-byte hex token per bot (stored in `data/bot-kv-tokens.json`, gitignored), writes `nexusdb.js` (CommonJS) + `nexusdb.py` (stdlib only) helpers into the bot's working dir, and spawns bots with `BOT_KV_URL`+`BOT_KV_TOKEN` env. Helpers JSON-stringify on write / parse on read; `/agent` UI tab "قاعدة البيانات" mirrors that contract (auto-wraps non-JSON input). On `deleteBot`, KV cache is closed and the SQLite file is removed.
- **Mobile Preview Frame** — 5th right-panel tab "معاينة" (web/game/web-app only) with Desktop (1280) / Tablet (768) / Mobile (390) toggle. Iframe auto-scales to fit panel width via ref-based `--preview-scale` CSS var; device frames get a ring outline; reload + open-in-new-tab buttons.
- **Right-side IDE panel** in `/agent` now has 5 tabs: Files (tree + editable Monaco + global search), Logs (live tail), Secrets (encrypted), Checkpoints (git history with one-click restore), Preview (device-frame iframe).
- **Strict ownership** on all secrets/checkpoints/files-content/search endpoints: `bot.userId === requesting userId` (anonymous bots only manageable in fully-anonymous mode).

## Import / Export Features

- GitHub import: clone a repo, specify entry file + branch
- URL import: download raw file from any URL (e.g. Replit raw, GitHub raw)
- GitHub export: push bot file to a GitHub repo via API
- Download: `GET /api/bots/:id/download` — download bot file
- **Templates**: 6 pre-built templates (Ping/Slash/Moderation/Welcome in JS, Ping/Logger in Python) in Deploy dialog

## Landing Page (`/`)

- Public landing page (visible when signed out), fully internationalized
- Hero: "Build bots, games, websites and apps with a single prompt"
- Project types grid (6 cards: Discord Bot / Website / Game / Web App / API Server / Python Script)
- Localized example prompts per language
- LanguageSwitcher in navbar; RTL layout flips automatically for AR

## Dashboard (`/dashboard`)

- `CreateProjectDialog` (replaces old UploadBotDialog) — 2-step flow:
  1. Pick project type (6-card grid with icons)
  2. Enter project name + (for bots/api) pick JS/Python; create → auto-redirect to editor
- `BotCard` shows project-type icon + colored badge + filename
- Web projects get a Preview (👁) button on the card opening `/api/preview/:botId/` in a new tab

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
