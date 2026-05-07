# AMY 施工管理

Japanese interior contractor (内装屋) business app. Hero feature: **施工台帳** (planned vs actual cost / 粗利). Other: 案件 (見積〜竣工), 見積/請求書 with line items + 10% tax, 顧客/職人 (customers carry `defaultProfitRate` 規定利率 + `defaultSalesCommissionRate` 営業歩合 — flow into Project response as `standardProfitRate` and prefill new project `salesCommissionRate`), 工程表 (Gantt), 出面表, 進捗記録. UI is entirely Japanese.

## Architecture

pnpm monorepo, TypeScript project references.

- `lib/db` — Drizzle ORM, Postgres. Tables incl. `customers`, `staff` (職人/外注), `employees` (社員: 営業/現場監督/事務), `projects`, `quotes`, `invoices`, `cost_entries`, `schedule_entries`, `progress_logs`, `vendor_invoices`, `vendor_quotes`, `project_phases`, `app_users`. `projects.unitNumber` (マンション号室) drives auto-routing of vendor docs.
- `lib/object-storage-web` — Uppy `<ObjectUploader>` for presigned PUT. React is a peer dep only.
- `lib/api-spec` — OpenAPI 3 source of truth.
- `lib/api-zod`, `lib/api-client-react` — orval-generated Zod validators + react-query hooks.
- `artifacts/api-server` — Express + Drizzle at `/api/*`. esbuild → `dist/index.mjs`.
- `artifacts/amy` — React + Vite + Wouter + shadcn/ui + Tailwind v4 + Recharts.

Theme: warm wood + controlled industrial — off-white bg, dark wood-tone sidebar, navy primary, blueprint-blue accent, rust-red destructive, emerald positive (粗利).

## Conventions

- Hooks always from `@workspace/api-client-react`.
- Mutations: `mutateAsync` then `queryClient.invalidateQueries({ queryKey: getXxxQueryKey(...) })`.
- Backend serializers: `n()` for numerics, `isoDate()`/`isoDateTime()` for dates. Drizzle date columns require ISO string before insert/update.
- Tax 10% (Japanese consumption tax), hardcoded.
- Endpoint: cost ledger uses `/api/cost-entries` (not `/api/costs`).

## Build / Run

- API: `pnpm --filter @workspace/api-server run build` (workflow runs `dev`).
- Frontend: Vite dev (workflow already configured).
- DB schema: `pnpm --filter @workspace/db run push`.
- After openapi.yaml change: `pnpm --filter @workspace/api-zod run codegen` and `pnpm --filter @workspace/api-client-react run codegen`.
- If `lib/object-storage-web` dist gets stale: `pnpm --filter @workspace/object-storage-web exec tsc --build`.

## 認証 (Replit-managed Clerk)

Keys auto-provisioned (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`). Login providers managed in workspace **Auth pane** — no external Clerk dashboard. Prod has its own user store; dev keys are `pk_test`/`sk_test` (expected).

**Frontend** (`src/App.tsx`): `<ClerkProvider>` inside `<WouterRouter base={basePath}>`; `proxyUrl` from `VITE_CLERK_PROXY_URL` (empty in dev). `routerPush`/`routerReplace` strip basePath. Routes `/sign-in/*?` and `/sign-up/*?` (optional wildcard required for Clerk sub-routes). All other paths gated by `<Show signed-in>` → `ProtectedRoutes` (RoleProvider + AppShell + routes); `<Show signed-out>` → `LandingPage`. `clerkAppearance` uses `theme: shadcn`, `cssLayerName: "clerk"`, navy primary, Japanese localization.

**Tailwind v4 gotcha**: `@layer theme, base, clerk, components, utilities;` BEFORE `@import 'tailwindcss';` in `src/index.css`, and `tailwindcss({ optimize: false })` in `vite.config.ts`. Otherwise Clerk renders fine in dev but breaks in prod.

**Backend** (`artifacts/api-server/src/app.ts`): `clerkProxyMiddleware` at `/api/__clerk` BEFORE body parsers (prod only — Clerk dev tenants reject proxied requests). `clerkMiddleware()` from `@clerk/express` after CORS+json. `routes/index.ts` mounts `requireAuth` (checks `getAuth(req).userId`) AFTER `healthRouter` — so `/api/health` is public, every other `/api/*` requires sign-in. `clerkMiddleware` accepts both Clerk session cookies AND `Authorization: Bearer <jwt>` headers — useful for environments where third-party cookies are blocked.

**iframe / cross-site cookie workaround**: `App.tsx` `<ClerkBearerTokenBridge>` (rendered inside `<ClerkProvider>`/`<QueryClientProvider>`) calls `useAuth().getToken()` and registers it via `setAuthTokenGetter()` from `@workspace/api-client-react`. `lib/api-client-react/src/custom-fetch.ts` `customFetch` then attaches `Authorization: Bearer <token>` to every API request. This makes the app work inside the Replit workspace iframe on iOS Safari / iOS Chrome where Clerk's session cookie would otherwise be blocked by ITP. Cookies still work where the browser allows them; the bearer header is purely additive.

## プロフィール (per-user, Clerk unsafeMetadata)

Stored in `user.unsafeMetadata.profile` so each social member only sees their own info. Auto-populated into 職人請求書/見積書.

- `lib/profile.ts` — `UserProfile`, `EMPTY_PROFILE`, `readProfile(user)`, `isProfileComplete(profile)`, `saveProfile(user, profile)`. All required EXCEPT `registrationNumber` (任意). Fields: companyName / registrationNumber / postalCode / address / email / bankName / branchName / accountType (default 普通) / accountNumber / accountHolder.
- `pages/profile-setup.tsx` used in two `mode`s: `"setup"` (forced after signup → `/`), `"edit"` (sidebar link → `/profile`).
- `App.tsx` `<ProfileGate>` inside `<Show signed-in>` after `<RoleProvider>`. If incomplete and path ≠ `/profile-setup`, redirects there. `EXTERNAL_ALLOWED_PREFIXES` (lib/role.tsx) includes `/profile`, `/profile-setup`.
- Vendor invoice/quote pages display issuer + bank as read-only cards from `readProfile(user)` with a "プロフィールを編集" button. Per-form fields (`recipientName`, `recipientContactName`, `authorName`) persist to localStorage `amy.vendorInvoiceForm.v1` / `amy.vendorQuoteForm.v1`. `authorName` defaults from `user.fullName`. `recipientContactName` (宛先のご担当者) and `authorName` (発行元の作成者) are independent — preview's recipient-side ご担当 row uses `recipientContactName`, issuer card 担当 row uses `authorName`. On save both are stamped into vendor_quotes/vendor_invoices `notes` (`作成者: X / ご担当: Y / 宛名: Z / freeform`); `parseAuthorRecipient` in `vendor-invoice-new.tsx` reads them back when prefilling from a source quote.

## ユーザー管理・権限 (server-managed roles + approval)

`app_users` table stores one row per Clerk user (`clerkUserId` unique) with `role` (`internal`|`external`) and `status` (`pending`|`approved`).

**Bootstrap** (`artifacts/api-server/src/lib/auth.ts` `getOrCreateAppUser`): on first sign-in, if NO approved-internal users yet, that user is auto-promoted to `internal`+`approved`. All later new users default to `external`+`pending`.

**Backend** (`routes/users.ts`):
- `GET /api/me` — upserts caller's row from Clerk. Available to every signed-in user (even pending).
- `GET /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id` — `requireInternal` middleware (403 unless `role==='internal' && status==='approved'`). PATCH/DELETE refuse self-demote/delete.

**Frontend**: `lib/role.tsx` `RoleProvider` calls `useGetMe()`. `App.tsx` `<ApprovalGate>` after `<ProfileGate>` — if `status !== 'approved'`, renders `pages/pending-approval.tsx`. Order: signed-in → profile complete → approved → app. `pages/users.tsx` (`/users`) is internal-only admin (Shield icon in sidebar). `RoleGuard` redirects external users to `/vendor-invoices` if they navigate to a restricted path.

### 社外ユーザーのデータ分離

`vendor_invoices`, `vendor_quotes`, `schedule_entries` carry a nullable `created_by` (Clerk userId), set automatically on POST.

- **List endpoints**: external callers get `WHERE created_by = :clerkUserId`. Internal sees all.
- **`GET /api/project-phases/overview`**: external → empty array. `/api/schedule` skips project-phases virtual-entry merge for external.
- **Mutations** (PATCH/DELETE on the 3 tables, plus `POST /api/vendor-quotes/:id/convert-to-invoice`): external caller + foreign `created_by` → 403. Convert stamps the new invoice's `created_by` to the caller.
- Legacy `created_by = NULL` rows: invisible to external (by design).

## 月次歩合 (`/commissions`, internal-only)

`GET /api/commissions?month=YYYY-MM` (`requireInternal`) groups commissions by person from invoices whose `sentAt` falls in the target month. `invoices.sentAt` is auto-stamped on `sentToClient` false→true (and cleared on true→false) in the POST/PATCH handlers; client-supplied `sentAt` wins when provided.

Three components per person:

1. **営業歩合** — per invoice: `invoice税込合計 × project.salesCommissionRate%` → attributed to `project.salesRep`.
2. **現場監督歩合** — only for **completed** projects whose latest sent invoice falls in the target month (so each project is counted exactly once, in the month its final invoice goes out). Formula: `規定超過粗利 × project.supervisorCommissionRate%`, where `規定超過粗利 = max(0, sum(invoice税込) − 営業歩合 − sum(invoice税込) × standardProfitRate% − sum(actualAmount))`. Falls back to `customer.defaultProfitRate` when project has no `standardProfitRate`. Attributed to `project.siteSupervisor`.
3. **他人売上ボーナス** — `staff.otherSalesBonusRate` (numeric, nullable, %) is the per-staff "亘ルール" default rate. Per-project override via `projects.otherSalesBonusRate` (numeric, nullable): NULL → fall back to staff default; explicit `0` → opt this project out. For each bonus staff, sum tax-incl invoice totals where `project.salesRep ≠ staff.name` and multiply by the effective rate. When the project rate is used, the line note appends ` (案件率)`. Excludes 監督歩合 by design (separate calc).

Page (`pages/commissions.tsx`): month picker (defaults to current), 3 **clickable** summary tiles that filter the per-person table:
- 「全体」 — 営業歩合 + 他人売上ボーナス + 監督歩合 (default view, 4 columns)
- 「営業 (含む他人売上ボーナス)」 — `salesCommission + otherSalesBonus`。亘の月次受取総額 (自身の営業 + 他人売上分) が一目で見える。表は営業歩合 + 他人売上ボーナス 2列に絞り、人物の合計列も両者の合算。展開明細も `sales` + `other_sales_bonus` のみ。
- 「現場監督歩合」 — `supervisor` のみ
選択中タイルは tone 色のリングでハイライト。Expandable per-person table with kind-tagged invoice lines linking to the project. Sidebar entry "月次歩合" with `Calculator` icon, `internalOnly: true`. Staff page exposes `otherSalesBonusRate` as both a dialog field and inline-editable column ("他人売上ボーナス %"). 案件作成フォーム (`project-new.tsx`) と 施工台帳 (`ledger-spreadsheet.tsx` 基本情報セクション) で per-project `otherSalesBonusRate` を編集可能 (空欄/0 の挙動は上記)。

**社員マスタ (営業/現場監督/事務)**: `employees` テーブルで管理 (職人 `staff` とは別)。`/employees` (社内のみ、`Briefcase` icon) で CRUD + インライン編集。フィールド: name / role (営業/現場監督/事務 + free text 自由追加可) / phone / email / `otherSalesBonusRate` (亘=2.5% など) / notes。バックエンド: `routes/employees.ts` (`requireInternal`)。

案件作成フォーム (`project-new.tsx`) の「担当営業」「担当現場監督」入力は `useListEmployees()` を呼び `/営業|sales/i`・`/現場|監督|supervisor/i` で役割フィルタした候補を `<datalist>` で表示 (プルダウン選択 + 自由入力どちらも可)。マスタにない名前を直接入力しても保存される。

**他人売上ボーナス率の所在**: 移行前は `staff.otherSalesBonusRate` だったが、亘は社員 (営業) なので `employees.otherSalesBonusRate` に集約。`commissions.ts` のボーナス対象者ループは `employeesTable` を読む。`staff.otherSalesBonusRate` 列は既存データ保持のため残置 (UI/集計からは参照しない)。**移行作業**: 旧 staff 側で 亘 等にボーナス率を入れていた場合、社員ページから登録し直すこと。

**人物マッチング (commissions.ts `getPerson`)**: salesRep / siteSupervisor の文字列を `employees.name` → `staff.name` の順で検索。社員が一級市民 (見つかればその id を `staffId` として返す)。両方になければ「職人/社員未登録」バッジ表示。

## Cross-document workflows

- **見積 → 請求書**: `POST /api/quotes/:id/convert-to-invoice` — creates a single summarized line item (description = subject or project name, unit "式", quantity 1, unitPrice = quote subtotal). Customer/contact/subject auto-filled.
- **見積 → 施工台帳**: `POST /api/quotes/:id/import-to-ledger` (`category` + `entryDate` + `replaceExisting`) creates `cost_entries` (planned) per line item, in a transaction.
- **見積 → 売上 自動同期**: any POST/PATCH/DELETE `/api/quotes/:id` calls `syncProjectContractAmount(projectId)` to set the project's `contractAmount` (= 売上 on 施工台帳) to the latest quote's **tax-included** total. Manual ledger edits to 売上 will be overridden the next time a quote is saved.
- **見積書の流用 (duplicate)**: 「複製して新規作成」 on `/quotes/:id`, or 「見積を流用」 on `/projects?status=completed` rows (opens `ReuseQuotePicker` Dialog using `useListQuotes({ projectId })`). Both navigate to `/quotes/new?fromQuoteId=<id>`. `pages/quote-new.tsx` reads the param via `useState` initializer, fetches via `useGetQuote`, and uses `prefilledRef` to one-shot prefill `subject`/`contactName`/`notes`/`items` (sets `subjectTouched=true` to prevent project-select overwrite). **Not** prefilled: projectId / customerId / quoteNumber / issueDate / validUntil. Backend unchanged.
- **職人見積書 (vendor quotes)**: `/vendor-quotes` (list) + `/vendor-quotes/new` (form). Mirrors vendor_invoices but stores `quoteDate` + nullable `validUntil`. Auto-creates `cost_entry` with **`plannedAmount`** (想定原価) — NOT actual — so the ledger shows planned vs actual side-by-side. Description: `"○○ 見積 (○号室)"`. Form-based PDF (no OCR). PDF title: 御見積書. localStorage: `amy.vendorQuoteForm.v1`. `/vendor-quotes` is in `EXTERNAL_ALLOWED_PREFIXES`.
- **職人見積書 → 職人請求書 変換**: 「請求書に変換」 on `/vendor-quotes` → confirm dialog → navigates to `/vendor-invoices/new?fromVendorQuoteId=<id>`. `vendor-invoice-new.tsx` reads the param, calls `useListVendorQuotes()` to find the source, and (one-shot via `prefilledFromQuoteRef`) prefills projectId, vendorName→companyName, and a single summary line `${projectName} 工事一式 / qty=1 / unitPrice=Math.round(amount/1.1)` (vendor-quote `amount` is tax-included; we back out the tax-excluded subtotal so `subtotal+tax ≈ amount`). Recipient/author parsed from `notes` ("作成者: X / 宛名: Y / freeform"). The user reviews/edits 請求日・支払期限・明細, then saves. **保存時の挙動**: html2canvas-pro + jsPDF で請求書PDFを毎回新規生成・アップロード（`fileUrl`/`fileName`）。`sourceQuote` がある場合は新請求書に **`quoteFileUrl`/`quoteFileName`** として元見積書のPDFを「引き継ぎPDF」として添付（DB列も同名）し、保存成功後に `useDeleteVendorQuote` で元の職人見積書を削除（見積一覧から請求一覧へ移行）。`vendor-invoices.tsx` の請求書ファイル列は `fileUrl`/`fileName` の下に小さく `[見積] quoteFileName` リンクを表示。職人見積削除に失敗しても請求書はロールバックせず警告トーストのみ。 The legacy backend `POST /api/vendor-quotes/:id/convert-to-invoice` route is no longer invoked by the UI (kept for back-compat); it had a defect: it reused the quote's PDF, so the file shown for the new invoice was actually the old 御見積書. Plan A above replaces it with a fresh client-generated PDF.
- **職人請求書を作成** (`/vendor-invoices/new`): Form-based. Fields: 宛名 (default 株式会社AMY, custom入力可), 作成者, 件名 (案件 dropdown — drives unitNumber for auto-routing), 発行日, 支払期限, 発行元 (read-only from profile), 振込先 (read-only from profile), 明細. html2canvas-pro + jsPDF render the preview to PDF, upload via `/api/storage/uploads/request-url`, POST to `/api/vendor-invoices`. Per-form `recipientName`+`authorName` persisted to `amy.vendorInvoiceForm.v1`.
- **職人請求書アップロード** (legacy upload-only flow at `/vendor-invoices`): server normalizes 号室 (drops 号室/号/室, full→half-width digits), looks up `projects.unitNumber`. On match, auto-creates `cost_entry` (category: `labor` if role contains 社員/自社, else `subcontract`) and links via `vendor_invoices.costEntryId`. Status `matched`|`unmatched`. Manual matching: `POST /api/vendor-invoices/:id/match`. Delete cascades cost_entry removal.
- **File uploads**: `POST /api/storage/uploads/request-url` returns `{uploadURL, objectPath}`. Frontend constructs serve path `/api/storage${objectPath}` for `vendor_invoices.fileUrl`. Files served by `GET /api/storage/objects/*` (currently unauthenticated).

## 竣工 / 請求済 自動移動 (sidebar shortcuts)

- Sidebar 「竣工」 → `/projects?status=completed`, 「請求済」 → `/invoices?paid=true`.
- `pages/projects-list.tsx` default filter `"active"` **excludes** `completed`. Status `<Select>` is hidden on the 竣工 view; `ACTIVE_STATUS_OPTIONS` (PROJECT_STATUS_OPTIONS minus completed) drives the dropdown otherwise. Title/subtitle switch on `?status=completed`.
- `pages/invoices-list.tsx` default `"unpaid"`. The all/paid/unpaid `<Select>` was removed; the URL param is the single switch.
- `app-shell.tsx` strips the query before checking `isPathAllowed`, and uses exact `path+query` match for filtered shortcuts so 案件 vs 竣工 (and 請求 vs 請求済) don't both highlight.

## Standalone pages

- **工程表** (`/gantt`): All projects in collapsible accordion. Reuses `ProjectGantt`. Filter by status (default: 施工中・契約済) + search by name/customer. Phase dialog includes 担当職人 dropdown — sets `project_phases.staffId`.
- **職人出面表** (`/staff-assignments`): Daily 職人×日付 matrix. Merges `schedule_entries` + virtual entries from `project_phases` (with `staffId`, expanded into daily entries, capped at 90 days/phase). Dedup by staffId+projectId+date. The 全案件 工程スケジュール section uses `GET /api/project-phases/overview` (no date filter). Assigned phases blue, unassigned amber.
- **スケジュール** (`/schedule`): Weekly 職人×曜日 grid (different from 工程表 — who works where).

## Inline editing (台帳形式)

- `components/editable-cell.tsx`: `EditableText`/`EditableNumber`/`EditableDate`. Save on blur and Enter; Escape sets a `cancelRef` flag the synchronous onBlur checks (state setters fire after blur, so a flag is needed). `required` reverts to original on empty.
- `pages/project-detail.tsx` `onCostEntryUpdate` runs a per-id writer chain (`writersRef`) with optimistic merge into `latestCostRef` — coalesces rapid sequential edits to the same row, no parallel PUTs, no lost-update race. Ledger refetch only resyncs ids without a pending writer.
- **施工台帳** (`/ledger`): `LedgerSpreadsheet` is fully editable (same writer-queue pattern), plus `onProjectUpdate`/`onCostEntryCreate`/`onCostEntryDelete`. Basic info section mirrors 案件登録 form.
- **職人一覧** (`/staff`): cells inline-editable via `useUpdateStaff`. On error, refetch to revert. Dialog kept only for 新規.
- **見積書詳細** (`/quotes/:id`): 編集 button toggles edit mode for 件名/ご担当/見積No/見積日/有効期限/備考/明細. `quoteNumber` and `issueDate` required before save.

## 請求書 (Invoice) format

- `/invoices/:id` uses formal Japanese 請求書 layout: customer 御中, ご担当, 件名, company info with registration number, 合計金額 (税込), 17-row line items, お振込先, 小計/消費税/合計.
- `invoices` table has `customerName`, `contactName`, `subject` nullable.
- Company info + bank details in `lib/company-info.ts` (`COMPANY_INFO`, `BANK_INFO`).

## Known gotchas

- Don't manually clear `dist/` between builds — esbuild does it. But if routes go missing, force-rebuild api-server.
- Orval `useUpdateInvoice` requires full body shape including `items`. When toggling `paid`, send the existing fields.
- DB push command is `pnpm --filter @workspace/db run push` (not `db:push`).
- After DB schema or openapi changes: run codegen + db push, then rebuild `lib/object-storage-web` if its dist is stale.
- `useListVendorQuotes(undefined, { query: { enabled, queryKey: getListVendorQuotesQueryKey() } })` — orval requires both `enabled` and `queryKey` when passing `query` options.
