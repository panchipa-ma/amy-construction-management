import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, appUsersTable } from "@workspace/db";
import {
  GetMeResponse,
  ListUsersResponse,
  UpdateUserBody,
  UpdateUserParams,
  UpdateUserResponse,
  DeleteUserParams,
  CreateInvitationBody,
  CreateInvitationResponse,
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

// App Store 5.1.1(v): ユーザー自身によるアカウント削除。
// app_users 行を消し、Clerk ユーザー本体も削除する (再サインアップは可能)。
router.delete("/me", async (req, res): Promise<void> => {
  const me = await getOrCreateAppUser(req);
  try {
    await clerkClient.users.deleteUser(me.clerkUserId);
  } catch (e) {
    req.log.error({ err: e }, "clerk user delete failed");
    res.status(500).json({ error: "アカウント削除に失敗しました" });
    return;
  }
  await db.delete(appUsersTable).where(eq(appUsersTable.id, me.id));
  res.sendStatus(204);
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

    // Fetch the target user to validate state transitions
    const [target] = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.id, params.data.id));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const nextStatus = body.data.status ?? target.status;
    const nextRole = body.data.role ?? target.role;

    // Policy: 社内メンバーが承認した場合に限り、社外→社内に変更できる。
    // つまり pending のまま社内権限は付与できない (社外として承認してから昇格)。
    if (nextRole === "internal" && nextStatus !== "approved") {
      res.status(400).json({
        error: "社内権限を付与する前に、まずユーザーを承認してください",
      });
      return;
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

// Clerk invitation: 社内メンバーが email を指定して招待。サインアップ後は
// 自動的に external + pending で app_users に登録される (getOrCreateAppUser)。
router.post(
  "/invitations",
  requireInternal,
  async (req, res): Promise<void> => {
    const parsed = CreateInvitationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const inv = await clerkClient.invitations.createInvitation({
        emailAddress: parsed.data.emailAddress,
        redirectUrl: parsed.data.redirectUrl ?? undefined,
        ignoreExisting: true,
      });
      res.json(
        CreateInvitationResponse.parse({
          id: inv.id,
          emailAddress: inv.emailAddress,
          status: inv.status,
          url: inv.url ?? null,
          createdAt: new Date(inv.createdAt).toISOString(),
        }),
      );
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        e?.message ??
        "招待の送信に失敗しました";
      res.status(400).json({ error: msg });
    }
  },
);

export default router;
