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

export const customersTable = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const staffTable = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  phone: text("phone"),
  dailyRate: numeric("daily_rate"),
  company: text("company"),
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
  salesRep: text("sales_rep"),
  siteSupervisor: text("site_supervisor"),
  notes: text("notes"),
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
  notes: text("notes"),
  status: text("status").notNull().default("unmatched"),
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
  notes: text("notes"),
  paid: boolean("paid").notNull().default(false),
  items: jsonb("items").$type<LineItemJson[]>().notNull().default([]),
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

export const progressLogsTable = pgTable("progress_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
