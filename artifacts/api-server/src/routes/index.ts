import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import healthRouter from "./health";
import customersRouter from "./customers";
import staffRouter from "./staff";
import projectsRouter from "./projects";
import quotesRouter from "./quotes";
import invoicesRouter from "./invoices";
import costsRouter from "./costs";
import scheduleRouter from "./schedule";
import progressRouter from "./progress";
import dashboardRouter from "./dashboard";
import vendorInvoicesRouter from "./vendor-invoices";
import vendorQuotesRouter from "./vendor-quotes";
import receiptsRouter from "./receipts";
import phasesRouter from "./phases";
import storageRouter from "./storage";
import ocrRouter from "./ocr";
import usersRouter from "./users";
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
router.use(requireAuth);
router.use(usersRouter);
router.use(requireApproved);
// Dashboard is internal-only: it aggregates data across all projects/users
// (status breakdown, recent activity with actor names, monthly invoice totals,
// cost pipeline). External users have no UI entry into it, but lock the
// endpoints down so a direct API call can't leak global data either.
router.use(requireInternal, dashboardRouter);
router.use(projectsRouter);
router.use(customersRouter);
router.use(staffRouter);
router.use(quotesRouter);
router.use(invoicesRouter);
router.use(costsRouter);
router.use(scheduleRouter);
router.use(progressRouter);
router.use(vendorInvoicesRouter);
router.use(vendorQuotesRouter);
router.use(receiptsRouter);
router.use(phasesRouter);
router.use(ocrRouter);

export default router;
