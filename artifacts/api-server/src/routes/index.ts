import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import healthRouter from "./health";
import customersRouter from "./customers";
import staffRouter from "./staff";
import employeesRouter from "./employees";
import projectsRouter from "./projects";
import quotesRouter from "./quotes";
import invoicesRouter from "./invoices";
import costsRouter from "./costs";
import scheduleRouter from "./schedule";
import progressRouter from "./progress";
import dashboardRouter from "./dashboard";
import vendorInvoicesRouter from "./vendor-invoices";
import vendorQuotesRouter from "./vendor-quotes";
import projectPhotosRouter from "./project-photos";
import receiptsRouter from "./receipts";
import phasesRouter from "./phases";
import storageRouter from "./storage";
import ocrRouter from "./ocr";
import usersRouter from "./users";
import reviewLoginRouter from "./review-login";
import commissionsRouter from "./commissions";
import printRouter from "./print";
import externalProjectsRouter from "./external-projects";
import { requireApproved, requireInternal } from "../lib/auth";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(healthRouter);
// Storage: GET /storage/objects/* and /storage/public-objects/* are public
// so saved PDFs can be opened directly in a new browser tab (object paths
// contain unguessable UUIDs). The POST upload endpoint inside storageRouter
// performs its own auth check.
router.use(storageRouter);
// App Store 審査用デモログイン (public)。env 未設定なら常に 401/false を返すだけ。
router.use(reviewLoginRouter);
router.use(requireAuth);
router.use(usersRouter);
router.use(requireApproved);
router.use(externalProjectsRouter);
// IMPORTANT: internal-only routers must gate requireInternal by PATH, not by
// `router.use(requireInternal, xxxRouter)`. In Express, a bare middleware in
// `use(mw, router)` is mounted at "/" and therefore runs for EVERY subsequent
// request — not just the ones the paired router handles. Doing that once leaks
// requireInternal onto all following routers (projects, vendor-invoices, ...),
// which 403s external users out of their own screens. Scope it to the exact
// path prefix instead so it only fires for that router's own routes.

// ── 社内(internal)のみ ───────────────────────────────────────────────
// 社内業務データ。社外(職人)ユーザーは UI に入れないだけでなく、API を直接
// 叩いても読めないよう requireInternal をパス単位でゲートする。社外向け画面
// (下のグループ) はこれらを一切呼ばないので、閉じても社外機能は壊れない。

// ダッシュボードは全案件・全ユーザーを横断集計するので社内のみ。
router.use("/dashboard", requireInternal);
router.use(dashboardRouter);
// 顧客マスタは社内のみ。
router.use("/customers", requireInternal);
router.use(customersRouter);
// 案件一覧・案件詳細・施工台帳は原価・利益などの社内情報を返すため社内のみ。
// 職人書類で必要な担当案件の最小情報は externalProjectsRouter から提供する。
router.use("/projects", requireInternal);
router.use(projectsRouter);
// 社員 (営業/現場監督/事務) は社内マスタなので社内のみ
router.use("/employees", requireInternal);
router.use(employeesRouter);
// 顧客向け 見積書/請求書 (売上) は社内文書。職人見積書/請求書 (/vendor-*) とは別物。
router.use("/quotes", requireInternal);
router.use(quotesRouter);
router.use("/invoices", requireInternal);
router.use(invoicesRouter);
// 請求書/見積書の印刷HTMLは社内文書なので社内のみ。
// (vendor-invoices/quotes 用の印刷はモバイル側で localストレージ + html ローカル生成)
router.use("/print", requireInternal);
router.use(printRouter);
// 原価台帳・領収書・進捗記録は社内のみ (粗利や原価は社外に見せない)。
router.use("/cost-entries", requireInternal);
router.use(costsRouter);
router.use("/receipts", requireInternal);
router.use(receiptsRouter);
router.use("/progress-logs", requireInternal);
router.use(progressRouter);
// 現場写真は社内マスタなので社内のみ
router.use("/project-photos", requireInternal);
router.use(projectPhotosRouter);
// 出面表 (職人×日付マトリクス) は社内の管理ビューなので社内のみ。
// 社外の「出面」入力は /schedule 側 (created_by で本人分のみ) を使う。
router.use("/staff/assignments", requireInternal);
// 月次歩合は社内全体の数字 (他人の売上を含む) を返すため社内のみ
router.use("/commissions", requireInternal);
router.use(commissionsRouter);

// ── 社外(職人)も利用可 (承認済みのみ) ────────────────────────────────
// 職人請求書/見積書の作成時に職人一覧は社外にも必要。staff は external には
// email を落として返す。schedule / vendor-* は created_by で本人分のみ、
// phases は overview のみ。
router.use(staffRouter);
router.use(scheduleRouter);
router.use(vendorInvoicesRouter);
router.use(vendorQuotesRouter);
router.use(phasesRouter);
router.use(ocrRouter);

export default router;
