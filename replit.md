# AMY 施工管理

## Overview

A Japanese interior contractor (内装屋) business management web app. The hero feature is the **施工台帳 (construction cost ledger / 原価管理)** showing planned vs actual cost with gross profit/rate per project. Other features: project lifecycle management (見積〜竣工), quotes/invoices with line items + 10% tax, customer/staff (職人) management, weekly schedule grid, and on-site progress logs (進捗記録).

UI is entirely in Japanese. No authentication — single-tenant tool.

## Architecture

pnpm monorepo with TypeScript project references.

- `lib/db` — Drizzle ORM, Postgres schema (8 tables: customers, staff, projects, quotes, invoices, cost_entries, schedule_entries, progress_logs).
- `lib/api-spec` — OpenAPI 3 source of truth (`openapi.yaml`).
- `lib/api-zod` — Generated Zod validators (orval). Re-exports schemas namespace under `types`.
- `lib/api-client-react` — Generated react-query hooks + types (orval).
- `artifacts/api-server` — Express + Drizzle backend at `/api/*`. Routes in `src/routes/*`. Built with esbuild → `dist/index.mjs`.
- `artifacts/amy` — React + Vite frontend (Wouter routing, shadcn/ui, Tailwind, Recharts).

## Theme

"Warm wood + controlled industrial" — off-white backgrounds, dark wood-tone sidebar, leather/wood primary, blueprint-blue accent, rust-red destructive, emerald positive (粗利).

## Conventions

- Hooks always imported from `@workspace/api-client-react`.
- Mutations use `mutateAsync` then `queryClient.invalidateQueries({ queryKey: getXxxQueryKey(...) })`.
- Backend serializers: `n()` coerces numeric DB values, `isoDate()`/`isoDateTime()` for date columns. Drizzle date columns require ISO string coercion before insert/update.
- Tax rate: hardcoded 10% (Japanese consumption tax).
- Endpoint naming: cost ledger uses `/api/cost-entries` (NOT `/api/costs`).

## Build/Run

- API server build: `pnpm --filter @workspace/api-server run build` (esbuild bundle). Workflow runs `dev` which builds + starts.
- Frontend: Vite dev server. Workflow already configured.
- Schema changes: `pnpm --filter @workspace/db run db:push`.
- Regenerate clients after openapi.yaml change: `pnpm --filter @workspace/api-zod run codegen` and `pnpm --filter @workspace/api-client-react run codegen`.

## Known gotchas

- Don't manually clear `dist/` between builds — esbuild already does it. But if routes mysteriously go missing, force-rebuild api-server.
- Orval generates `useUpdateInvoice` requiring full body shape, including `items`. When toggling `paid`, send the existing invoice fields.
