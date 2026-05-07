import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appUsersTable } from "@workspace/db";
import {
  GetMeResponse,
  ListUsersResponse,
  UpdateUserBody,
  UpdateUserParams,
  UpdateUserResponse,
  DeleteUserParams,
} from "@workspace/api-zod";
import {
  getOrCreateAppUser,
  requireInternal,
  serializeAppUser,
} from "../lib/auth";

const router: IRouter = Router();

router.get("/me", async (req, res): Promise<void> => {
  const me = await getOrCreateAppUser(req);
  res.json(GetMeResponse.parse(serializeAppUser(me)));
});

router.get("/users", requireInternal, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(appUsersTable)
    .orderBy(appUsersTable.createdAt);
  res.json(ListUsersResponse.parse(rows.map(serializeAppUser)));
});

router.patch(
  "/users/:id",
  requireInternal,
  async (req, res): Promise<void> => {
    const params = UpdateUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateUserBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const me = await getOrCreateAppUser(req);

    // Prevent the last admin from being demoted / unapproved (lock-out guard)
    if (me.id === params.data.id) {
      const wouldDemote =
        (body.data.role && body.data.role !== "internal") ||
        (body.data.status && body.data.status !== "approved");
      if (wouldDemote) {
        res
          .status(400)
          .json({ error: "自分自身の社内権限は変更できません" });
        return;
      }
    }

    const patch: Partial<typeof appUsersTable.$inferInsert> = {};
    if (body.data.role !== undefined) patch.role = body.data.role;
    if (body.data.status !== undefined) {
      patch.status = body.data.status;
      if (body.data.status === "approved") {
        patch.approvedAt = new Date();
        patch.approvedBy = me.clerkUserId;
      }
    }
    if (body.data.displayName !== undefined)
      patch.displayName = body.data.displayName;

    const [row] = await db
      .update(appUsersTable)
      .set(patch)
      .where(eq(appUsersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(UpdateUserResponse.parse(serializeAppUser(row)));
  },
);

router.delete(
  "/users/:id",
  requireInternal,
  async (req, res): Promise<void> => {
    const params = DeleteUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const me = await getOrCreateAppUser(req);
    if (me.id === params.data.id) {
      res.status(400).json({ error: "自分自身は削除できません" });
      return;
    }
    await db.delete(appUsersTable).where(eq(appUsersTable.id, params.data.id));
    res.sendStatus(204);
  },
);

export default router;
