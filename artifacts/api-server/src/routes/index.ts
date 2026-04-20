import { Router, type IRouter } from "express";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(projectsRouter);
router.use(customersRouter);
router.use(staffRouter);
router.use(quotesRouter);
router.use(invoicesRouter);
router.use(costsRouter);
router.use(scheduleRouter);
router.use(progressRouter);

export default router;
