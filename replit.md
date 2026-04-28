# Workspace

## Overview

Discord Bot Hosting panel — a full-stack monorepo for running Discord bots 24/7.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (provisioned but not currently used — bots stored in data/bots.json)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **File upload**: multer

## Artifacts

- **bot-host** (`/`) — React + Vite dashboard for managing bots (dark themed)
- **api-server** (`/api`) — Express 5 REST API with bot process management

## Bot Manager

- Bot files stored in `data/bot-files/`
- Bot registry persisted in `data/bots.json`
- Supports JavaScript (node) and Python (python3) bots
- Auto-restart on crash with exponential backoff (max 30s delay)
- In-memory ring buffer for logs (200 entries per bot)
- Bots with `autoRestart=true` resume automatically on server restart

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
