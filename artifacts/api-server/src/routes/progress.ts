import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, progressLogsTable, projectsTable } from "@workspace/db";
import {
  CreateProgressLogBody,
  DeleteProgressLogParams,
  ListProgressLogsQueryParams,
  ListProgressLogsResponse,
  CreateProgressLogResponse,
} from "@workspace/api-zod";
import { isoDate, isoDateTime } from "../lib/serializers";

const router: IRouter = Router();

async function serialize(p: typeof progressLogsTable.$inferSelect) {
  const [project] = await db
    .select({ name: projectsTable.name })
    .from(projectsTable)
    .where(eq(projectsTable.id, p.projectId));
  return {
    id: p.id,
    projectId: p.projectId,
    projectName: project?.name ?? "",
    date: isoDate(p.date)!,
    title: p.title,
    description: p.description,
    photoUrl: p.photoUrl,
    createdAt: isoDateTime(p.createdAt),
  };
}

router.get("/progress-logs", async (req, res): Promise<void> => {
  const parsedQuery = ListProgressLogsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { projectId } = parsedQuery.data;
  const rows = projectId
    ? await db
        .select()
        .from(progressLogsTable)
        .where(eq(progressLogsTable.projectId, projectId))
        .orderBy(sql`${progressLogsTable.date} desc`)
    : await db
        .select()
        .from(progressLogsTable)
        .orderBy(sql`${progressLogsTable.date} desc`);
  const serialized = await Promise.all(rows.map(serialize));
  res.json(ListProgressLogsResponse.parse(serialized));
});

router.post("/progress-logs", async (req, res): Promise<void> => {
  const parsed = CreateProgressLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(progressLogsTable)
    .values({
      projectId: parsed.data.projectId,
      date: parsed.data.date as unknown as string,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      photoUrl: parsed.data.photoUrl ?? null,
    })
    .returning();
  res.json(CreateProgressLogResponse.parse(await serialize(row)));
});

router.delete("/progress-logs/:id", async (req, res): Promise<void> => {
  const params = DeleteProgressLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(progressLogsTable)
    .where(eq(progressLogsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
