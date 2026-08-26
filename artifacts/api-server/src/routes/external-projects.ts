import { Router, type IRouter } from "express";
import { ListExternalAssignedProjectsResponse } from "@workspace/api-zod";
import { getOrCreateAppUser } from "../lib/auth";
import { listAssignedProjectsForExternalUser } from "../lib/externalProjectAccess";

const router: IRouter = Router();

router.get("/external/assigned-projects", async (req, res): Promise<void> => {
  const me = await getOrCreateAppUser(req);
  if (me.role !== "external") {
    res.status(403).json({ error: "Forbidden: 社外ユーザー専用のAPIです" });
    return;
  }

  const projects = await listAssignedProjectsForExternalUser(me);
  res.json(ListExternalAssignedProjectsResponse.parse(projects));
});

export default router;