# AMY 施工管理

## Overview

A Japanese interior contractor (内装屋) business management web app. The hero feature is the **施工台帳 (construction cost ledger / 原価管理)** showing planned vs actual cost with gross profit/rate per project. Other features: project lifecycle management (見積〜竣工), quotes/invoices with line items + 10% tax, customer/staff (職人) management, weekly schedule grid, and on-site progress logs (進捗記録).

UI is entirely in Japanese. No authentication — single-tenant tool.

## Architecture

pnpm monorepo with TypeScript project references.

- `lib/db` — Drizzle ORM, Postgres schema (10 tables: customers, staff, projects, quotes, invoices, cost_entries, schedule_entries, progress_logs, vendor_invoices, project_phases). `projects.unitNumber` (マンション号室) for auto-routing.
- `lib/object-storage-web` — Uppy-based `<ObjectUploader>` component for presigned PUT uploads. React is a peer dep only (do NOT add `react` as devDep — duplicates React copy and breaks hooks).
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

## Cross-document workflows

- **見積 → 請求書**: `POST /api/quotes/:id/convert-to-invoice` copies line items into a new invoice. UI: button on quote-detail page.
- **見積 → 施工台帳**: `POST /api/quotes/:id/import-to-ledger` with `category` + `entryDate` + `replaceExisting` creates `cost_entries` (planned amount) for each line item. Wrapped in transaction.
- **職人請求書アップロード**: page at `/vendor-invoices`. Staff selects 職人 + 号室 + 金額 + ファイル. Server normalizes 号室 (drops 号室/号/室, full→half-width digits) and looks up `projects.unitNumber`. On match, auto-creates a `cost_entry` (category: `labor` if role contains 社員/自社, else `subcontract`) and links via `vendor_invoices.costEntryId`. Status = `matched` | `unmatched`. Manual matching via `POST /api/vendor-invoices/:id/match`. Delete cascades cost_entry removal.
- **File uploads**: `POST /api/storage/uploads/request-url` returns `{uploadURL, objectPath}`. Frontend captures `objectPath` from this call (via ref in onGetUploadParameters), then constructs serve path `/api/storage${objectPath}` for `vendor_invoices.fileUrl`. Files are served by `GET /api/storage/objects/*` (currently unauthenticated — fine for single-tenant).

## Standalone pages

- **工程表** (`/gantt`): Top-level Gantt chart page listing all projects in collapsible accordion. Reuses `ProjectGantt` component. Filter by status (default: 施工中・契約済) and search by name/customer. Each project expands to show its full interactive Gantt chart with drag, resize, add/edit/delete phases. Phase dialog includes 担当職人 dropdown — assigning a staff member to a phase sets `project_phases.staffId`.
- **職人出面表** (`/staff-assignments`): Daily attendance matrix (職人×日付) and card-based list view. Automatically merges data from two sources: (1) real `schedule_entries` and (2) virtual entries derived from `project_phases` with `staffId` set (date range expanded into daily entries). Deduplication by staffId+projectId+date ensures no double-counting. Phase expansion is capped at 90 days per phase for safety. Below the staff grid, a **全案件 工程スケジュール** section shows ALL project phases (even unassigned ones) grouped by project as a timeline grid. Uses `GET /api/project-phases/overview` endpoint with optional `from`/`to` date filters. Assigned phases render in blue, unassigned in amber.
- **スケジュール** (`/schedule`): Weekly staff assignment grid (職人×曜日). Different from 工程表 — this is about who works where.

## Inline editing (台帳形式)

- `components/editable-cell.tsx` exposes `EditableText`, `EditableNumber`, `EditableDate`. All save on blur and on Enter; Escape sets a `cancelRef` flag that the synchronous onBlur checks to skip commit (state setters fire after blur, so a flag is needed). `required` prop reverts to original on empty.
- `pages/project-detail.tsx` `onCostEntryUpdate` runs a per-id writer chain (`writersRef`) with optimistic merge into `latestCostRef`. The writer loops, re-reading the cache each iteration (fingerprint-compared), so rapid sequential edits to the same row are coalesced and sent in order — no parallel PUTs to the same row, no lost-update race. The ledger refetch only resyncs `latestCostRef` for ids without a pending writer.
- **施工台帳** (`/ledger`): The `LedgerSpreadsheet` component is now fully editable on the ledger page — same writer-queue pattern as project-detail for cost entries, plus `onProjectUpdate`/`onCostEntryCreate`/`onCostEntryDelete` handlers. Previously read-only.
- **職人一覧** (`/staff`): Table cells (氏名, 職種, 会社, 電話, 日当) are inline-editable using `EditableText`/`EditableNumber`. Each blur saves immediately via `useUpdateStaff`. On error, the staff list is re-fetched to revert. Dialog kept only for creating new staff.
- **見積書詳細** (`/quotes/:id`): Edit mode toggled by 編集 button. In edit mode, 件名, ご担当, 見積No, 見積日, 有効期限, 備考, and all line items become editable. Line items can be added/removed. Validation: quoteNumber and issueDate are required before save. Save calls `useUpdateQuote` with full body.

## Known gotchas

- Don't manually clear `dist/` between builds — esbuild already does it. But if routes mysteriously go missing, force-rebuild api-server.
- Orval generates `useUpdateInvoice` requiring full body shape, including `items`. When toggling `paid`, send the existing invoice fields.
- DB push command is `pnpm --filter @workspace/db run push` (script name is `push`, not `db:push`).
- After DB schema or openapi changes, run codegen + db push, then `pnpm --filter @workspace/object-storage-web exec tsc --build` if its dist gets stale (it has `composite: true`).
