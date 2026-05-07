# AMY 施工管理

Japanese interior contractor (内装屋) business app. UI 全面日本語。Hero feature: **施工台帳** (planned vs actual cost / 粗利)。他: 案件 (見積〜竣工), 見積/請求書 (line items + 10% 消費税), 顧客/職人, 工程表 (Gantt), 出面表, 進捗記録, 月次歩合。

## Architecture

pnpm monorepo, TypeScript project references。

- `lib/db` — Drizzle ORM + Postgres。主テーブル: `customers`, `staff` (職人/外注), `employees` (社員: 営業/現場監督/事務), `projects`, `quotes`, `invoices`, `cost_entries`, `schedule_entries`, `progress_logs`, `vendor_invoices`, `vendor_quotes`, `project_phases`, `app_users`。`projects.unitNumber` (マンション号室) が職人請求書の自動振り分けキー。
- `lib/api-spec` — OpenAPI 3 source of truth。`lib/api-zod` + `lib/api-client-react` は orval-generated。
- `lib/object-storage-web` — Uppy `<ObjectUploader>` (presigned PUT)。React は peer dep のみ。
- `artifacts/api-server` — Express + Drizzle、`/api/*`。esbuild → `dist/index.mjs`。
- `artifacts/amy` — React + Vite + Wouter + shadcn/ui + Tailwind v4 + Recharts。

Theme: warm wood + controlled industrial — off-white bg, dark wood-tone sidebar, navy primary, blueprint-blue accent, rust-red destructive, emerald positive (粗利)。

## Conventions

- API hooks は必ず `@workspace/api-client-react` から。
- Mutations: `mutateAsync` → `queryClient.invalidateQueries({ queryKey: getXxxQueryKey(...) })`。
- Backend serializers: `n()` (numeric) / `isoDate()` / `isoDateTime()`。Drizzle date 列は ISO 文字列で渡す。
- 消費税は 10% 固定。
- Cost ledger endpoint は `/api/cost-entries` (not `/api/costs`)。

## Build / Run

- API build: `pnpm --filter @workspace/api-server run build` (workflow は `dev`)。
- DB schema push: `pnpm --filter @workspace/db run push`。
- openapi.yaml 変更後: `pnpm --filter @workspace/api-spec run codegen` (zod + react-query 両方再生成)。
- `lib/object-storage-web` の dist が古い時: `pnpm --filter @workspace/object-storage-web exec tsc --build`。

## 認証 (Replit-managed Clerk)

Keys 自動 (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`)。Login providers は workspace **Auth pane** で管理 (外部 Clerk dashboard なし)。Prod は dev とユーザーストア別 (dev は `pk_test`/`sk_test`)。

**Frontend** (`src/App.tsx`): `<ClerkProvider>` を `<WouterRouter base={basePath}>` 内に。`proxyUrl=VITE_CLERK_PROXY_URL` (dev は空)。`routerPush`/`routerReplace` で basePath を strip。Routes `/sign-in/*?` `/sign-up/*?` (Clerk sub-route 用に optional wildcard)。それ以外は `<Show signed-in>` → `ProtectedRoutes` (RoleProvider + AppShell + routes)、`<Show signed-out>` → `LandingPage`。`clerkAppearance`: `theme: shadcn`, `cssLayerName: "clerk"`, navy primary, ja localization。

**Tailwind v4 gotcha**: `src/index.css` で `@layer theme, base, clerk, components, utilities;` を `@import 'tailwindcss';` の **前** に書く。`vite.config.ts` で `tailwindcss({ optimize: false })`。これを怠ると prod のみ Clerk が崩れる。

**Backend** (`artifacts/api-server/src/app.ts`): `clerkProxyMiddleware` を `/api/__clerk` に body parser **より前** で (prod のみ — dev tenant は proxied request を拒否)。`clerkMiddleware()` (`@clerk/express`) を CORS+json の後。`routes/index.ts` は `requireAuth` (`getAuth(req).userId` チェック) を `healthRouter` の **後** に mount → `/api/health` のみ public。`clerkMiddleware` は session cookie と `Authorization: Bearer <jwt>` 両対応。

**iframe / cross-site cookie 回避**: `App.tsx` の `<ClerkBearerTokenBridge>` (`<ClerkProvider>`/`<QueryClientProvider>` 内) が `useAuth().getToken()` を `setAuthTokenGetter()` (`@workspace/api-client-react`) 経由で登録。`lib/api-client-react/src/custom-fetch.ts` が全 API request に `Authorization: Bearer` を追加。iOS Safari/Chrome の ITP で cookie が落ちる workspace iframe でも動作。Cookie が通る環境では cookie も併用 (additive)。

## プロフィール (per-user, Clerk unsafeMetadata)

`user.unsafeMetadata.profile` に保存 — social member 各自の情報を分離。職人請求書/見積書に自動展開。

- `lib/profile.ts`: `UserProfile`, `EMPTY_PROFILE`, `readProfile(user)`, `isProfileComplete(profile)`, `saveProfile(user, profile)`。`registrationNumber` 以外は必須 (companyName / postalCode / address / email / bankName / branchName / accountType (default 普通) / accountNumber / accountHolder)。
- `pages/profile-setup.tsx` は `mode="setup"` (signup 後強制 → `/`) と `mode="edit"` (sidebar → `/profile`) の 2 モード。
- `App.tsx` の `<ProfileGate>` が `<RoleProvider>` 直後に挟まり、incomplete & path ≠ `/profile-setup` なら redirect。`EXTERNAL_ALLOWED_PREFIXES` (`lib/role.tsx`) に `/profile`, `/profile-setup` 含む。
- 職人見積書/請求書の発行元・振込先は profile から read-only カードで表示 + 「プロフィールを編集」ボタン。`recipientName` / `recipientContactName` (宛先のご担当) / `authorName` (発行元の作成者) は per-form で localStorage (`amy.vendorInvoiceForm.v1` / `amy.vendorQuoteForm.v1`) に保存。`authorName` 既定値は `user.fullName`。プレビュー: 宛先側 ご担当 = `recipientContactName`、発行元 担当 = `authorName`。保存時 notes に `作成者: X / ご担当: Y / 宛名: Z / freeform` で stamp。`parseAuthorRecipient` (`vendor-invoice-new.tsx`) が見積流用時に読み戻す。

## ユーザー管理・権限 (server-managed)

`app_users` (`clerkUserId` unique) に `role` (`internal`|`external`) + `status` (`pending`|`approved`)。

- **Bootstrap** (`artifacts/api-server/src/lib/auth.ts` `getOrCreateAppUser`): 初回サインインで承認済 internal が 0 人なら自動 promote (`internal`+`approved`)。それ以降の新規は `external`+`pending`。
- **Backend** (`routes/users.ts`): `GET /api/me` は全サインイン済ユーザー可 (pending 含む)。`GET /api/users` / `PATCH` / `DELETE` は `requireInternal` (403 unless `internal`+`approved`)。PATCH/DELETE は self-demote/delete を拒否。
- **Frontend**: `lib/role.tsx` `RoleProvider` が `useGetMe()` を呼ぶ。`App.tsx` の `<ApprovalGate>` (ProfileGate の後) が `status !== 'approved'` なら `pages/pending-approval.tsx` を表示。順序: signed-in → profile complete → approved → app。`/users` (Shield icon) は internal-only。`RoleGuard` が external を `/vendor-invoices` に redirect。

### 社外ユーザーのデータ分離

`vendor_invoices`, `vendor_quotes`, `schedule_entries` に nullable `created_by` (Clerk userId)。POST 時自動 stamp。

- List: external は `WHERE created_by = :clerkUserId`、internal は全件。
- `GET /api/project-phases/overview`: external → `[]`。`/api/schedule` も external では project-phases virtual entry merge を skip。
- Mutations (PATCH/DELETE on the 3 tables, `POST /api/vendor-quotes/:id/convert-to-invoice`): external が他人の `created_by` を触ると 403。Convert は新 invoice の `created_by` を caller に。
- Legacy `created_by = NULL` 行は external から不可視 (by design)。

## 月次歩合 (`/commissions`, internal-only)

`GET /api/commissions?month=YYYY-MM` (`requireInternal`) — 対象月に `invoices.sentAt` が入る請求書を担当者ごとに集計。`sentAt` は POST/PATCH で `sentToClient` の false→true 遷移時に自動 stamp (true→false でクリア)。client 指定の `sentAt` があればそれが優先。

3 components:

1. **営業歩合** — per invoice: `invoice税込合計 × 実効営業歩合率%` を `project.salesRep` に計上。**実効率 = `project.salesCommissionRate − Σマネジメント報酬率`** (salesRep 以外の bonus 受取人率を引く)。例: エディ案件 (営業 7.5%) で 亘 (2.5%) なら エディ 5%、亘 2.5%。総支払額不変、内訳のみ分割。負になる場合 0 でクリップ (亘は 2.5% を必ず受け取る)。
2. **現場監督歩合** — **completed** 案件の最新送付請求書が対象月にある時のみ (各案件 1 回きり)。`規定超過粗利 × project.supervisorCommissionRate%`、`規定超過粗利 = max(0, sum(invoice税込) − 営業歩合 − sum(invoice税込) × standardProfitRate% − sum(actualAmount))`。`standardProfitRate` がなければ `customer.defaultProfitRate` にフォールバック。`project.siteSupervisor` に計上。
3. **マネジメント報酬** — **giver-driven, per-project**。担当営業 (salesRep) が「この案件の売上の一部を誰に渡すか」を選ぶ。`projects.otherSalesBonusRecipient` (社員名) + `projects.otherSalesBonusRate` (%)。両方セット & recipient ≠ salesRep の時のみ有効。各請求書税込合計 × rate% を recipient に計上。**この金額は営業歩合から差し引いた分** (上記 1) — 二重計上ではない。監督歩合は除外。

Page (`pages/commissions.tsx`): month picker (default = 当月) + 3 つの **クリック可能** なサマリタイル:
- 「全体」 — 営業歩合 + マネジメント報酬 + 監督歩合 (default, 4 列)
- 「営業 (含むマネジメント報酬)」 — `salesCommission + otherSalesBonus`。亘の月次受取総額 (自分の営業 + 他人売上分) が一目で見える。表は 2 列に絞り合計列も両者合算。展開明細は `sales` + `other_sales_bonus` のみ。
- 「現場監督歩合」 — `supervisor` のみ

選択タイルは tone 色のリングでハイライト。Expandable per-person table、kind タグ付き invoice 行は project にリンク。Sidebar 「月次歩合」 (`Calculator` icon, `internalOnly: true`)。

**社員マスタ (営業/現場監督/事務)**: `employees` テーブル (職人 `staff` とは別)。`/employees` (社内のみ、`Briefcase` icon) で CRUD + インライン編集。Fields: name / role (営業/現場監督/事務 + free text 可) / phone / email / notes。Backend: `routes/employees.ts` (`requireInternal`)。

`project-new.tsx` の「担当営業」「担当現場監督」入力は `useListEmployees()` を呼び `/営業|sales/i`・`/現場|監督|supervisor/i` で role フィルタした候補を `<datalist>` で表示 (選択 + 自由入力どちらも可)。マスタにない名前を直接入力しても保存可。

**人物マッチング (`commissions.ts` `getPerson`)**: salesRep / siteSupervisor 文字列を `employees.name` → `staff.name` の順で検索。社員が一級市民。両方になければ「職人/社員未登録」バッジ。

**マネジメント報酬の編集 UI**: `project-new.tsx` と `ledger-spreadsheet.tsx` (基本情報セクション) で per-project `otherSalesBonusRecipient` (社員 datalist) + `otherSalesBonusRate` を編集。受取人空欄なら対象外。`employees.otherSalesBonusRate` / `staff.otherSalesBonusRate` 列は廃止 (DB 残置のみ)。

## 顧客の規定値 → 案件プリフィル

`customers` に default 値を持たせ、案件作成時に自動入力 (手動上書き可):

- `defaultProfitRate` → `project.standardProfitRate` (規定粗利の算出に使用)
- `defaultSalesCommissionRate` → `project.salesCommissionRate`
- `defaultSupervisorCommissionRate` → `project.supervisorCommissionRate`
- `defaultSalesRep` → `project.salesRep`
- `defaultOtherSalesBonusRecipient` → `project.otherSalesBonusRecipient`
- `defaultOtherSalesBonusRate` → `project.otherSalesBonusRate`

`project-new.tsx` 顧客 Select の `onValueChange` でフィールドが空のときのみ顧客既定値を流し込む (`||` で preserve-if-customer-null)。`pages/customers.tsx` ダイアログ Layout: 1 段目 = 営業歩合 / 監督歩合 / 担当営業 (社員 datalist)、2 段目 = 規定利率 / マネジメント報酬 受取人 (社員 datalist) / 同率 (受取人空欄時 disabled)。一覧テーブルにも マネジメント報酬列 (`率% (受取人)` 形式) を表示。

## Cross-document workflows

- **見積 → 請求書**: `POST /api/quotes/:id/convert-to-invoice` — 単一 summary 行 (description = subject or project name, unit "式", qty 1, unitPrice = quote subtotal)。Customer/contact/subject 自動入力。
- **見積 → 施工台帳**: `POST /api/quotes/:id/import-to-ledger` (`category` + `entryDate` + `replaceExisting`) — line item ごとに `cost_entries` (planned) を transaction で作成。
- **見積 → 売上 自動同期**: `/api/quotes/:id` の POST/PATCH/DELETE で `syncProjectContractAmount(projectId)` を呼び、最新見積の **税込合計** を `project.contractAmount` (= 施工台帳の売上) に。手動編集は次の見積保存で上書きされる。
- **見積書の流用**: `/quotes/:id` の「複製して新規作成」 or `/projects?status=completed` の「見積を流用」 (`ReuseQuotePicker` Dialog, `useListQuotes({ projectId })`) → `/quotes/new?fromQuoteId=<id>`。`pages/quote-new.tsx` が `useState` initializer で param を読み、`useGetQuote` + `prefilledRef` で `subject`/`contactName`/`notes`/`items` を一回だけ prefill (`subjectTouched=true` をセットして project select の上書きを防ぐ)。**Not** prefilled: projectId / customerId / quoteNumber / issueDate / validUntil。
- **職人見積書** (`/vendor-quotes`, `/vendor-quotes/new`): vendor_invoices と並列。`quoteDate` + nullable `validUntil`。`cost_entry` を **`plannedAmount`** (想定原価、actual ではない) で auto 作成 → 台帳に planned vs actual を並列表示。Description: `"○○ 見積 (○号室)"`。Form-based PDF (no OCR)。PDF title: 御見積書。localStorage: `amy.vendorQuoteForm.v1`。`/vendor-quotes` は `EXTERNAL_ALLOWED_PREFIXES` 内。
- **職人見積書 → 職人請求書 変換**: 「請求書に変換」 → `/vendor-invoices/new?fromVendorQuoteId=<id>`。`vendor-invoice-new.tsx` が `useListVendorQuotes()` で source を取得し、`prefilledFromQuoteRef` で projectId / vendorName→companyName / 単一 summary 行 `${projectName} 工事一式 / qty=1 / unitPrice=Math.round(amount/1.1)` を一回だけ prefill (vendor-quote の `amount` は税込なので 1.1 で割って小計を算出)。Recipient/author は `notes` から `parseAuthorRecipient` で復元。**保存時**: html2canvas-pro + jsPDF で請求書 PDF を毎回新規生成・アップロード (`fileUrl`/`fileName`)。`sourceQuote` がある場合は `quoteFileUrl`/`quoteFileName` (DB 列も同名) に元見積書 PDF を引き継ぎ添付し、`useDeleteVendorQuote` で元の職人見積書を削除 (見積 → 請求一覧へ移行)。`vendor-invoices.tsx` の請求書ファイル列は `fileUrl`/`fileName` の下に `[見積] quoteFileName` を小さくリンク表示。職人見積削除失敗時は請求書を rollback せず toast 警告のみ。Legacy backend route `POST /api/vendor-quotes/:id/convert-to-invoice` は UI からは未使用 (back-compat 用残置、quote PDF 流用の不具合あり)。
- **職人請求書を作成** (`/vendor-invoices/new`): Form-based。Fields: 宛名 (default 株式会社AMY、custom 入力可), 作成者, 件名 (案件 dropdown — unitNumber を駆動), 発行日, 支払期限, 発行元 (read-only from profile), 振込先 (read-only from profile), 明細。html2canvas-pro + jsPDF で PDF 化 → `/api/storage/uploads/request-url` でアップロード → `POST /api/vendor-invoices`。`recipientName`+`authorName` は `amy.vendorInvoiceForm.v1` に persist。
- **職人請求書アップロード (legacy)** (`/vendor-invoices`): server が号室を normalize (号室/号/室 を drop、全角→半角)、`projects.unitNumber` で lookup。一致時 `cost_entry` (category: `labor` if role に 社員/自社, else `subcontract`) を auto 作成し `vendor_invoices.costEntryId` でリンク。Status `matched` / `unmatched`。手動 match: `POST /api/vendor-invoices/:id/match`。Delete は cost_entry も cascade。
- **File uploads**: `POST /api/storage/uploads/request-url` → `{uploadURL, objectPath}`。Frontend は `vendor_invoices.fileUrl` を `/api/storage${objectPath}` 形式で構築。`GET /api/storage/objects/*` で配信 (現状 unauthenticated)。

## 竣工 / 請求済 sidebar shortcuts

- 「竣工」 → `/projects?status=completed`、「請求済」 → `/invoices?paid=true`。
- `pages/projects-list.tsx` default `"active"` (completed 除外)。`?status=completed` view では status `<Select>` を hide、それ以外は `ACTIVE_STATUS_OPTIONS` (PROJECT_STATUS_OPTIONS minus completed) を使用。Title/subtitle も切替。
- `pages/invoices-list.tsx` default `"unpaid"`、Select 廃止 — URL param が単一スイッチ。
- `app-shell.tsx` は `isPathAllowed` 判定で query を strip し、フィルタ shortcut は `path+query` exact match で判定 (案件 vs 竣工、請求 vs 請求済 が両方 highlight しない)。

## Standalone pages

- **工程表** (`/gantt`): 全案件を accordion で。`ProjectGantt` を再利用。Status (default 施工中・契約済) + 検索 (案件名・顧客名)。Phase dialog に 担当職人 dropdown — `project_phases.staffId` をセット。
- **職人出面表** (`/staff-assignments`): 日別 職人×日付 matrix。`schedule_entries` + `project_phases` (with `staffId`) を merge。**Frontend で各 phase の `startDate`〜`endDate` 範囲のセルにのみ virtual entry を入れる** (範囲外は空)。Dedup by staffId+projectId+date。全案件工程スケジュールセクションは `GET /api/project-phases/overview` (date filter なし)。アサイン phase 青、未アサイン amber。Backend `getPhaseVirtualEntries` (`routes/schedule.ts`) は 90 日 cap で展開。
- **スケジュール** (`/schedule`): 週次 職人×曜日 grid (工程表とは別 — 誰がどこで働くか)。

## Inline editing (台帳形式)

- `components/editable-cell.tsx`: `EditableText`/`EditableNumber`/`EditableDate`。Save on blur/Enter; Escape は同期 onBlur が読む `cancelRef` フラグで判定 (state setter は blur 後に発火するので flag 必須)。`required` は空時 original に revert。
- `pages/project-detail.tsx` `onCostEntryUpdate` は per-id writer chain (`writersRef`) + optimistic merge (`latestCostRef`) — 同行への連続編集を coalesce、parallel PUT なし、lost-update なし。Ledger refetch は pending writer のない id だけ resync。
- **施工台帳** (`/ledger`): `LedgerSpreadsheet` 全編集対応 (同 writer-queue) + `onProjectUpdate`/`onCostEntryCreate`/`onCostEntryDelete`。基本情報セクションは案件登録 form を mirror。
- **職人一覧** (`/staff`): `useUpdateStaff` でセル編集。エラー時 refetch で revert。Dialog は新規のみ。
- **見積書詳細** (`/quotes/:id`): 編集 button で 件名/ご担当/見積No/見積日/有効期限/備考/明細 を編集。`quoteNumber` と `issueDate` は保存前必須。

## 請求書 (Invoice) format

- `/invoices/:id` は formal な日本式 請求書 layout: 御中, ご担当, 件名, 登録番号付き company info, 合計金額 (税込), 17 行 line items, お振込先, 小計/消費税/合計。
- `invoices` table の `customerName`, `contactName`, `subject` は nullable。
- Company info + bank details は `lib/company-info.ts` (`COMPANY_INFO`, `BANK_INFO`)。

## Known gotchas

- esbuild が dist/ を自動 clear するので手動削除しない。route 抜けが起きたら api-server を強制再ビルド。
- Orval `useUpdateInvoice` は items 含む full body を要求。`paid` だけトグルする時も既存 fields を全送信。
- DB push は `pnpm --filter @workspace/db run push` (not `db:push`)。
- DB schema or openapi 変更後: codegen + db push、必要なら `lib/object-storage-web` も再ビルド。
- `useListVendorQuotes(undefined, { query: { enabled, queryKey: getListVendorQuotesQueryKey() } })` — orval は `query` options 渡し時 `enabled` と `queryKey` 両方を要求。
