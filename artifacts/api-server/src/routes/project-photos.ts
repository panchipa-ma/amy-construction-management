import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, projectPhotosTable } from "@workspace/db";
import {
  ListProjectPhotosQueryParams,
  ListProjectPhotosResponse,
  CreateProjectPhotoBody,
  CreateProjectPhotoResponse,
  UpdateProjectPhotoBody,
  UpdateProjectPhotoParams,
  UpdateProjectPhotoResponse,
  DeleteProjectPhotoParams,
} from "@workspace/api-zod";
import { isoDateTime } from "../lib/serializers";
import { getOrCreateAppUser } from "../lib/auth";

const router: IRouter = Router();

type Row = typeof projectPhotosTable.$inferSelect;

function serialize(p: Row) {
  return {
    id: p.id,
    projectId: p.projectId,
    fileUrl: p.fileUrl,
    fileName: p.fileName,
    caption: p.caption,
    createdBy: p.createdBy,
    createdAt: isoDateTime(p.createdAt)!,
  };
}

router.get("/project-photos", async (req, res): Promise<void> => {
  const parsed = ListProjectPhotosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(projectPhotosTable)
    .where(eq(projectPhotosTable.projectId, parsed.data.projectId))
    .orderBy(desc(projectPhotosTable.createdAt));
  res.json(ListProjectPhotosResponse.parse(rows.map(serialize)));
});

router.post("/project-photos", async (req, res): Promise<void> => {
  const parsed = CreateProjectPhotoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // fileUrl は object storage 配信パスのみ許可 (任意 URL 注入を防止)
  if (!/^\/api\/storage\/objects\//.test(parsed.data.fileUrl)) {
    res.status(400).json({ error: "Invalid fileUrl" });
    return;
  }
  const me = await getOrCreateAppUser(req);
  const [row] = await db
    .insert(projectPhotosTable)
    .values({
      projectId: parsed.data.projectId,
      fileUrl: parsed.data.fileUrl,
      fileName: parsed.data.fileName,
      caption: parsed.data.caption ?? null,
      createdBy: me.clerkUserId,
    })
    .returning();
  res.json(CreateProjectPhotoResponse.parse(serialize(row)));
});

router.patch("/project-photos/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectPhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProjectPhotoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const updates: Partial<typeof projectPhotosTable.$inferInsert> = {};
  if (body.data.caption !== undefined) updates.caption = body.data.caption;
  const [row] = await db
    .update(projectPhotosTable)
    .set(updates)
    .where(eq(projectPhotosTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(UpdateProjectPhotoResponse.parse(serialize(row)));
});

router.delete("/project-photos/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectPhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(projectPhotosTable)
    .where(eq(projectPhotosTable.id, params.data.id));
  res.status(204).send();
});

export default router;
