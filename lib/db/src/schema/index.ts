import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  date,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

export const appUsersTable = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email"),
  displayName: text("display_name"),
  role: text("role").notNull().default("external"),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const customersTable = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  // 規定利率 (%) — 施工台帳「規定粗利額」算出に使用。
  defaultProfitRate: numeric("default_profit_rate").notNull().default("20"),
  // 営業歩合の規定値 (%) — 案件作成時に salesCommissionRate のプリフィルに使用。
  defaultSalesCommissionRate: numeric("default_sales_commission_rate")
    .notNull()
    .default("5"),
  // 現場監督歩合の規定値 (%) — 規定超過粗利に対する監督への配分率。
  defaultSupervisorCommissionRate: numeric("default_supervisor_commission_rate")
    .notNull()
    .default("30"),
  // 担当営業の規定値 — 案件作成時に salesRep のプリフィルに使用。
  defaultSalesRep: text("default_sales_rep"),
  // マネジメント報酬受取人の規定値 — 案件作成時に otherSalesBonusRecipient のプリフィル。
  defaultOtherSalesBonusRecipient: text("default_other_sales_bonus_recipient"),
  // マネジメント報酬率の規定値 (%) — 案件作成時に otherSalesBonusRate のプリフィル。
  defaultOtherSalesBonusRate: numeric("default_other_sales_bonus_rate"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const staffTable = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  phone: text("phone"),
  email: text("email"),
  dailyRate: numeric("daily_rate"),
  company: text("company"),
  // マネジメント報酬率 (%) — レガシー (社員テーブルに移行済)。
  // 既存データ保持用に列は残すが、UI/集計は employeesTable.otherSalesBonusRate を参照する。
  otherSalesBonusRate: numeric("other_sales_bonus_rate"),
  // アプリにサインインしたユーザーとの紐付け (任意)。職人が招待されてサインインしたら
  // ここで結ぶことで、出面表/職人請求書/職人見積書をそのユーザー専用にスコープできる。
  appUserId: uuid("app_user_id").references(() => appUsersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// 社員 (営業 / 現場監督 / 事務) — 職人 (subcontractor) とは別管理。
// 営業歩合 / 監督歩合 / マネジメント報酬の紐付け先。
export const employeesTable = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 営業 / 現場監督 / 事務 (free text — 自由追加可)
  role: text("role").notNull(),
  phone: text("phone"),
  email: text("email"),
  // マネジメント報酬率 (%) — 自分以外の営業が獲得した売上から受け取る歩合 (例: 亘=2.5%)
  otherSalesBonusRate: numeric("other_sales_bonus_rate"),
  notes: text("notes"),
  // アプリにサインインしたユーザーとの紐付け (任意)。社員が招待されてサインインしたら
  // ここで結ぶ。internal ロール昇格や歩合計算と整合性を取りやすくなる。
  appUserId: uuid("app_user_id").references(() => appUsersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectsTable = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code"),
  status: text("status").notNull().default("estimating"),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customersTable.id, { onDelete: "restrict" }),
  siteAddress: text("site_address"),
  unitNumber: text("unit_number"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  contractAmount: numeric("contract_amount").notNull().default("0"),
  salesCommissionRate: numeric("sales_commission_rate").notNull().default("5"),
  // 規定利率 (%) — 施工台帳の規定粗利額算出に使用。NULL時は顧客の defaultProfitRate にフォールバック。
  standardProfitRate: numeric("standard_profit_rate"),
  // 現場監督歩合率 (%) — 規定超過粗利のうち監督への配分率。顧客既定値からプリフィル可。
  supervisorCommissionRate: numeric("supervisor_commission_rate")
    .notNull()
    .default("30"),
  // マネジメント報酬の受取人 (社員 employees.name)。空欄ならこの案件はマネジメント報酬対象外。
  // 担当営業 (salesRep) が「自分の売上の一部を誰に分けるか」を選ぶ。
  otherSalesBonusRecipient: text("other_sales_bonus_recipient"),
  // マネジメント報酬の率 (%)。recipient が指定されているときのみ有効。
  otherSalesBonusRate: numeric("other_sales_bonus_rate"),
  salesRep: text("sales_rep"),
  siteSupervisor: text("site_supervisor"),
  notes: text("notes"),
  // 施工台帳の完了フラグ。set されると現場監督歩合の発生月になる。
  // 「施工台帳を完了」UI でトグル。完了済を取り消すと null に戻る。
  ledgerCompletedAt: timestamp("ledger_completed_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vendorInvoicesTable = pgTable("vendor_invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").references(() => staffTable.id, {
    onDelete: "restrict",
  }),
  vendorName: text("vendor_name").notNull().default(""),
  projectId: uuid("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  costEntryId: uuid("cost_entry_id"),
  unitNumber: text("unit_number").notNull(),
  amount: numeric("amount").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  // 職人見積書から請求書に変換したときに引き継ぐ見積書PDF (任意)。
  quoteFileUrl: text("quote_file_url"),
  quoteFileName: text("quote_file_name"),
  notes: text("notes"),
  status: text("status").notNull().default("unmatched"),
  // 職人への振込済みかどうか。元請から自社への入金 (invoices.paid) とは別。
  paid: boolean("paid").notNull().default(false),
  // 振込済にした日付。paid を false→true にした際に自動で当日が入る。
  // 「職人振込済」サイドバーの月絞り込みグルーピング基準。
  paidAt: date("paid_at"),
  createdBy: text("created_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const vendorQuotesTable = pgTable("vendor_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").references(() => staffTable.id, {
    onDelete: "restrict",
  }),
  vendorName: text("vendor_name").notNull().default(""),
  projectId: uuid("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  costEntryId: uuid("cost_entry_id"),
  unitNumber: text("unit_number").notNull(),
  amount: numeric("amount").notNull(),
  quoteDate: date("quote_date").notNull(),
  validUntil: date("valid_until"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("unmatched"),
  createdBy: text("created_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const receiptsTable = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projectsTable.id, {
    onDelete: "set null",
  }),
  costEntryId: uuid("cost_entry_id"),
  vendor: text("vendor").notNull(),
  unitNumber: text("unit_number"),
  amount: numeric("amount").notNull(),
  receiptDate: date("receipt_date").notNull(),
  category: text("category").notNull().default("expense"),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("unmatched"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type LineItemJson = {
  description: string;
  unit?: string | null;
  quantity: number;
  unitPrice: number;
  /**
   * 備考。Web の quote 編集 UI が `it.notes` で書き込み・表示する追加フィールド。
   * 請求書 (invoices) では現状未使用だが共通型に含める。
   */
  notes?: string | null;
};

export const quotesTable = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  subject: text("subject"),
  contactName: text("contact_name"),
  quoteNumber: text("quote_number").notNull(),
  issueDate: date("issue_date").notNull(),
  validUntil: date("valid_until"),
  notes: text("notes"),
  items: jsonb("items").$type<LineItemJson[]>().notNull().default([]),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invoicesTable = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  customerName: text("customer_name"),
  contactName: text("contact_name"),
  subject: text("subject"),
  notes: text("notes"),
  paid: boolean("paid").notNull().default(false),
  // 入金済にした日付。paid を false→true にした際に自動で当日が入る。
  // 「入金済」サイドバーの月絞り込みグルーピング基準。
  paidAt: date("paid_at"),
  // 元請（顧客）へ請求書を送付済かどうか。入金状況とは独立。
  sentToClient: boolean("sent_to_client").notNull().default(false),
  // 元請へ送付した日付。sentToClient を false→true にした際に自動で当日が入る。
  // 月次歩合計算 (commissions) はこの日付の月でグルーピングする。
  sentAt: date("sent_at"),
  items: jsonb("items").$type<LineItemJson[]>().notNull().default([]),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const costEntriesTable = pgTable("cost_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  description: text("description").notNull(),
  vendor: text("vendor"),
  plannedAmount: numeric("planned_amount").notNull().default("0"),
  actualAmount: numeric("actual_amount").notNull().default("0"),
  entryDate: date("entry_date").notNull(),
  notes: text("notes"),
  // 見積書から自動取込された予算原価。見積書の保存ごとに sync (削除→再作成)。
  // 見積書が削除されたら cascade で消える。手動作成エントリは null。
  sourceQuoteId: uuid("source_quote_id").references(() => quotesTable.id, {
    onDelete: "cascade",
  }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const scheduleEntriesTable = pgTable("schedule_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staffTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  task: text("task").notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectPhasesTable = pgTable("project_phases", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => staffTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("planned"),
  color: text("color"),
  sortOrder: numeric("sort_order").notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const projectPhotosTable = pgTable("project_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  caption: text("caption"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const progressLogsTable = pgTable("progress_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  photoUrl: text("photo_url"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
