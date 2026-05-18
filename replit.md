# AMY 施工管理

Japanese interior contractor (内装屋) business app. UI 全面日本語。Hero feature: **施工台帳** (planned vs actual cost / 粗利)。他: 案件 (見積〜竣工), 見積/請求書 (line items + 10% 消費税), 顧客/職人, 工程表 (Gantt), 出面表, 進捗記録, 月次歩合。

## Architecture

pnpm monorepo, TypeScript project references。

- `lib/db` — Drizzle ORM + Postgres。主テーブル: `customers`, `staff` (職人/外注), `employees` (社員: 営業/現場監督/事務), `projects`, `quotes`, `invoices`, `cost_entries`, `schedule_entries`, `progress_logs`, `vendor_invoices`, `vendor_quotes`, `project_phases`, `app_users`。`projects.unitNumber` (マンション号室) が職人請求書の自動振り分けキー。
- `lib/api-spec` — OpenAPI 3 source of truth。`lib/api-zod` + `lib/api-client-react` は orval-generated。
- `lib/object-storage-web` — Uppy `<ObjectUploader>` (presigned PUT)。
- `artifacts/api-server` — Express + Drizzle、`/api/*`。esbuild → `dist/index.mjs`。
- `artifacts/amy` — React + Vite + Wouter + shadcn/ui + Tailwind v4 + Recharts。
- `artifacts/mobile` — Expo (expo-router) + React Native。**Web/モバイル機能パリティ必須**: Web で追加/変更した機能はモバイルにも同時に反映する (顧客/案件/見積/請求書/職人請求書/台帳/歩合 など)。新規実装・バグ修正時は両方を更新し、片方だけで完結させない。

Theme: warm wood + controlled industrial — off-white bg, dark wood-tone sidebar, navy primary, blueprint-blue accent, rust-red destructive, emerald positive (粗利)。

## Conventions

- API hooks は必ず `@workspace/api-client-react` から。
- Mutations: `mutateAsync` → `queryClient.invalidateQueries({ queryKey: getXxxQueryKey(...) })`。
- Backend serializers: `n()` (numeric) / `isoDate()` / `isoDateTime()`。Drizzle date 列は ISO 文字列で渡す。
- 消費税は 10% 固定。Cost ledger endpoint は `/api/cost-entries` (not `/api/costs`)。
- 会社情報・銀行情報は `lib/company-info.ts` の `COMPANY_INFO` / `BANK_INFO` (代表 TEL: 06-6780-9124)。

## Build / Run

- API build: `pnpm --filter @workspace/api-server run build` (workflow は `dev`)。
- DB schema push: `pnpm --filter @workspace/db run push` (not `db:push`)。
- openapi.yaml 変更後: `pnpm --filter @workspace/api-spec run codegen` (zod + react-query 両方再生成)。
- `lib/object-storage-web` の dist が古い時: `pnpm --filter @workspace/object-storage-web exec tsc --build`。

## 認証 (Replit-managed Clerk)

Keys 自動 (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`)。Login providers は workspace **Auth pane** で管理。Prod / dev はユーザーストア別。

- **Frontend** (`src/App.tsx`): `<ClerkProvider>` を `<WouterRouter base={basePath}>` 内に。`proxyUrl=VITE_CLERK_PROXY_URL` (dev は空)。Routes `/sign-in/*?` `/sign-up/*?`、それ以外は signed-in → `ProtectedRoutes`、signed-out → `LandingPage`。`clerkAppearance`: shadcn theme + navy + ja localization。
- **Tailwind v4 gotcha**: `src/index.css` で `@layer theme, base, clerk, components, utilities;` を `@import 'tailwindcss';` の **前** に書く + `vite.config.ts` で `tailwindcss({ optimize: false })`。怠ると prod のみ Clerk が崩れる。
- **Backend** (`artifacts/api-server/src/app.ts`): `clerkProxyMiddleware` を `/api/__clerk` に body parser **より前** で (prod のみ)。`clerkMiddleware()` を CORS+json の後。`requireAuth` は `healthRouter` の後 → `/api/health` のみ public。
- **iframe / cross-site cookie 回避**: `<ClerkBearerTokenBridge>` が `useAuth().getToken()` を `setAuthTokenGetter()` 経由で登録 → `lib/api-client-react/src/custom-fetch.ts` が全 request に `Authorization: Bearer` を付与。iOS Safari ITP 対策。

## ユーザー管理・権限

`app_users` (`clerkUserId` unique) に `role` (`internal`|`external`) + `status` (`pending`|`approved`)。

- **Bootstrap** (`getOrCreateAppUser`): 初回サインインで承認済 internal が 0 人なら自動 promote。それ以降の新規は `external`+`pending`。
- **Backend**: `GET /api/me` 全員可。`/api/users` 系は `requireInternal` (self-demote/delete 拒否)。
- **Frontend Gates** (順序): signed-in → `<ProfileGate>` (incomplete なら `/profile-setup`) → `<ApprovalGate>` (`pending` なら `/pending-approval`) → app。`RoleGuard` が external を `/vendor-invoices` に redirect。`/users` `/employees` `/commissions` は internal-only。

### 社外ユーザーのデータ分離

`vendor_invoices` / `vendor_quotes` / `schedule_entries` に nullable `created_by` (Clerk userId)。POST 時自動 stamp。

- List: external は `WHERE created_by = :clerkUserId`、internal は全件。
- `GET /api/project-phases/overview` / `/api/schedule` の phase virtual entry merge: external は skip。
- Mutations + `convert-to-invoice`: external が他人の `created_by` を触ると 403。
- Legacy `created_by = NULL` 行は external から不可視 (by design)。

## プロフィール (Clerk unsafeMetadata)

`user.unsafeMetadata.profile` に保存 (social member ごとに分離)。職人請求書/見積書の発行元・振込先に自動展開。

- `lib/profile.ts`: `UserProfile`, `EMPTY_PROFILE`, `readProfile`, `isProfileComplete`, `saveProfile`。`registrationNumber` 以外は必須。
- `pages/profile-setup.tsx`: `mode="setup"` (signup 後強制) / `mode="edit"` (`/profile`)。
- 職人見積書/請求書: 発行元・振込先は profile から read-only 表示。`recipientName` / `recipientContactName` / `authorName` (default = `user.fullName`) は per-form localStorage (`amy.vendorInvoiceForm.v1` / `amy.vendorQuoteForm.v1`)。保存時 notes に `作成者: X / ご担当: Y / 宛名: Z / freeform` で stamp。`parseAuthorRecipient` (`vendor-invoice-new.tsx`) が見積流用時に読み戻す。

## 月次歩合 (`/commissions`, internal-only)

`GET /api/commissions?month=YYYY-MM` — 対象月に `invoices.sentAt` が入る請求書を担当者ごとに集計。`sentAt` は `sentToClient` の false→true 遷移で自動 stamp (true→false でクリア)。client 指定優先。

**「竣工ベース統一」**: 3 種すべて、ステータス=`completed` 案件で **最新の送付請求書が対象月** にある時、その案件の **全請求書合計 (税込)** をベースに **一度に** 計上する (案件 1 つにつき各歩合 1 回)。受注/施工中の案件は対象外。`commissionableProjects` で gating 済。

3 components (同じ `sales = sum(税込)` を共有):

1. **営業歩合** — `sales × 実効営業歩合率%` を `project.salesRep` に計上。**実効率 = `project.salesCommissionRate − Σマネジメント報酬率`**。例: エディ案件 (営業 7.5%) + 亘 (2.5%) なら エディ 5%、亘 2.5%。負は 0 でクリップ。
2. **現場監督歩合** — `規定超過粗利 × project.supervisorCommissionRate%`、`規定超過粗利 = max(0, sales − sales × salesRate% − sales × standardProfitRate% − sum(actualAmount))`。`standardProfitRate` がなければ `customer.defaultProfitRate` にフォールバック。`project.siteSupervisor` に計上。
3. **マネジメント報酬** — giver-driven, per-project。`projects.otherSalesBonusRecipient` + `otherSalesBonusRate` (recipient ≠ salesRep の時のみ有効)。`sales × rate%` を recipient に。**営業歩合から差し引いた分** — 二重計上ではない。

Page: month picker + 3 つのクリック可能サマリタイル (全体 / 営業含むマネジメント報酬 / 現場監督)。Expandable per-person table、kind タグ付き invoice 行は project にリンク。

**社員マスタ** (`/employees`, internal-only): `employees` テーブル (職人 `staff` とは別)。Fields: name / role (営業/現場監督/事務 + free text 可) / phone / email / notes。`routes/employees.ts` (`requireInternal`)。`project-new.tsx` の「担当営業」「担当現場監督」入力は role 別 datalist (選択 + 自由入力どちらも可)。

**人物マッチング** (`commissions.ts` `getPerson`): salesRep / siteSupervisor 文字列を `employees.name` → `staff.name` の順で検索。両方になければ「職人/社員未登録」バッジ。

**マネジメント報酬の編集 UI**: `project-new.tsx` と `ledger-spreadsheet.tsx` 基本情報セクション (社員 datalist + rate%)。

## 顧客の規定値 → 案件プリフィル

`customers` の default 値が案件作成時に自動入力 (手動上書き可):

- `defaultProfitRate` → `project.standardProfitRate`
- `defaultSalesCommissionRate` / `defaultSupervisorCommissionRate` → 同名フィールド
- `defaultSalesRep` / `defaultOtherSalesBonusRecipient` / `defaultOtherSalesBonusRate` → 同名フィールド

`project-new.tsx` 顧客 Select の `onValueChange` でフィールドが空のときのみ流し込む (`||` で preserve-if-customer-null)。`customers.tsx` ダイアログにマネジメント報酬 受取人 (社員 datalist) + 同率 (受取人空欄時 disabled)、一覧テーブルにもマネジメント報酬列。

## Cross-document workflows

- **見積 → 請求書**: `POST /api/quotes/:id/convert-to-invoice` — 単一 summary 行 (description = subject or project name, unit "式", qty 1, unitPrice = quote subtotal)。
- **見積 → 施工台帳**: `POST /api/quotes/:id/import-to-ledger` (`category` + `entryDate` + `replaceExisting`) — line item ごとに `cost_entries` (planned) を作成。
- **見積 → 売上 自動同期**: `/api/quotes/:id` の POST/PATCH/DELETE で `syncProjectContractAmount(projectId)` が最新見積の **税込合計** を `project.contractAmount` に。手動編集は次の見積保存で上書き。
- **見積書の流用**: `/quotes/new?fromQuoteId=<id>` — `useGetQuote` + `prefilledRef` で `subject`/`contactName`/`notes`/`items` を一回だけ prefill (`subjectTouched=true` で project select の上書きを防ぐ)。**Not** prefilled: projectId / customerId / quoteNumber / issueDate / validUntil。
- **職人見積書** (`/vendor-quotes`): vendor_invoices と並列。`cost_entry` を **`plannedAmount`** で auto 作成 → 台帳に planned vs actual を並列表示。Form-based PDF (no OCR、title 御見積書)。`amy.vendorQuoteForm.v1` localStorage。`EXTERNAL_ALLOWED_PREFIXES` 内。
- **職人見積書 → 職人請求書 変換**: 「請求書に変換」 → `/vendor-invoices/new?fromVendorQuoteId=<id>`。`prefilledFromQuoteRef` で projectId / vendorName→companyName / 単一 summary 行 (`unitPrice = Math.round(amount/1.1)` — vendor-quote の `amount` は税込)。Recipient/author は notes から復元。**保存時**: 請求書 PDF 新規生成 + アップロード。`sourceQuote` がある場合 `quoteFileUrl`/`quoteFileName` に元見積書 PDF を引き継ぎ、元の職人見積書を削除 (失敗時は rollback せず toast 警告のみ)。`vendor-invoices.tsx` の請求書ファイル列に `[見積] quoteFileName` を小さくリンク表示。
- **職人請求書を作成** (`/vendor-invoices/new`): Form-based。html2canvas-pro + jsPDF で PDF 化 → `/api/storage/uploads/request-url` でアップロード → `POST /api/vendor-invoices`。`recipientName`+`authorName` は localStorage persist。
- **職人請求書アップロード (legacy)** (`/vendor-invoices`): server が号室を normalize (号室/号/室 を drop、全角→半角)、`projects.unitNumber` で lookup。一致時 `cost_entry` (category: `labor` if role に 社員/自社, else `subcontract`) を auto 作成し `vendor_invoices.costEntryId` でリンク。手動 match: `POST /api/vendor-invoices/:id/match`。Delete は cost_entry も cascade。
- **File uploads**: `POST /api/storage/uploads/request-url` → `{uploadURL, objectPath}`。`vendor_invoices.fileUrl` を `/api/storage${objectPath}` 形式で構築。`GET /api/storage/objects/*` で配信 (現状 unauthenticated)。

## 竣工 / 請求済 sidebar shortcuts

- 「竣工」 → `/projects?status=completed`、「請求済」 → `/invoices?paid=true`。
- `projects-list.tsx` default `"active"` (completed 除外)。`?status=completed` view では status `<Select>` を hide。
- `invoices-list.tsx` default `"unpaid"`、Select 廃止 — URL param が単一スイッチ。
- 月絞り込み: 竣工 = `endDate`、入金済 = `invoices.paidAt`、職人振込済 = `vendor_invoices.paidAt`。`paidAt` は `paid` の false→true で本日自動 stamp、true→false で null。client 指定優先。default は「全体」、選択肢は対象データから自動生成 (新→旧)。
- `app-shell.tsx` の `isPathAllowed` は query を strip、フィルタ shortcut は `path+query` exact match で highlight 判定。

## Standalone pages

- **工程表** (`/gantt`): 全案件を accordion で `ProjectGantt` 再利用。Status (default 施工中・契約済) + 検索。Phase dialog に 担当職人 dropdown (`project_phases.staffId`)。
  - **PDF出力** (CardHeader): 伝統的な日本式 工程表シート (`components/print-gantt-sheet.tsx` の `PrintGanttSheet`) — A4 横、月ごとに 1 ページ。
  - 上部: 株式会社AMY + TEL (現場監督の `employees.phone` → 未登録なら `COMPANY_INFO.tel`)。
  - Header 1 行: 工事名 / 案件名 / 構造 (空欄手書き用) / 作成者 / 監督名。
  - グリッド: 令和年月 + 日番号行 + 曜日行 (日=赤/土=青、週末セル `#e8e8e8`) + 工事項目行 (最低 12 行)。各 phase は赤線 (3px) + 矢印で span 表示 (月境界で clip、startDate ソート)。
  - 全枠線統一 (`1px solid #444`)。複数月案件は `getMonthsForPhases(phases)` で範囲計算 (最大 24 ヶ月)、各月のシートを画面外 (`position: fixed; left: -100000`) に hidden render → html2canvas-pro でキャプチャ → jsPDF で各月別ページ追加。
- **職人出面表** (`/staff-assignments`): 日別 職人×日付 matrix。`schedule_entries` + `project_phases` (with `staffId`) を merge。**Frontend で各 phase の `startDate`〜`endDate` 範囲のセルにのみ virtual entry を入れる**。Dedup by staffId+projectId+date。アサイン phase 青、未アサイン amber。Backend `getPhaseVirtualEntries` は 90 日 cap。
- **スケジュール** (`/schedule`): 週次 職人×曜日 grid (誰がどこで働くか — 工程表とは別)。

## Inline editing (台帳形式)

- `components/editable-cell.tsx`: `EditableText`/`EditableNumber`/`EditableDate`。Save on blur/Enter; Escape は同期 onBlur が読む `cancelRef` フラグで判定 (state setter は blur 後に発火するので flag 必須)。`required` は空時 original に revert。
- `pages/project-detail.tsx` `onCostEntryUpdate` は per-id writer chain (`writersRef`) + optimistic merge (`latestCostRef`) — 同行への連続編集を coalesce、parallel PUT なし、lost-update なし。Ledger refetch は pending writer のない id だけ resync。
- **施工台帳** (`/ledger`): `LedgerSpreadsheet` 全編集対応 + `onProjectUpdate`/`onCostEntryCreate`/`onCostEntryDelete`。基本情報セクションは案件登録 form を mirror。
- **職人一覧** (`/staff`): `useUpdateStaff` でセル編集。エラー時 refetch で revert。Dialog は新規のみ。
- **見積書詳細** (`/quotes/:id`): 編集 button で 件名/ご担当/見積No/見積日/有効期限/備考/明細 を編集。`quoteNumber` と `issueDate` は保存前必須。

## 請求書 (Invoice) format

- `/invoices/:id` は formal な日本式 請求書 layout: 御中, ご担当, 件名, 登録番号付き company info, 合計金額 (税込), 17 行 line items, お振込先, 小計/消費税/合計。
- `invoices` table の `customerName`, `contactName`, `subject` は nullable。

## Known gotchas

- esbuild が dist/ を自動 clear するので手動削除しない。route 抜けが起きたら api-server を強制再ビルド。
- Orval `useUpdateInvoice` は items 含む full body を要求 — `paid` だけトグルする時も既存 fields を全送信。
- DB schema or openapi 変更後: codegen + db push、必要なら `lib/object-storage-web` も再ビルド。
- `useListVendorQuotes(undefined, { query: { enabled, queryKey: getListVendorQuotesQueryKey() } })` — orval は `query` options 渡し時 `enabled` と `queryKey` 両方を要求。
