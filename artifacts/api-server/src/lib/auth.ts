import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, and, isNull } from "drizzle-orm";
import { db, appUsersTable, staffTable, employeesTable } from "@workspace/db";

export type AppUserRow = typeof appUsersTable.$inferSelect;

/**
 * Resolve the signed-in user's app_users row. Creates it on first sight.
 *
 * Bootstrap rule: when there are no approved-internal users yet, the very
 * first signed-in user is auto-promoted to internal + approved (so somebody
 * can administer the app). Every subsequent new user defaults to
 * external + pending and must be approved by an internal admin.
 */
export async function getOrCreateAppUser(req: Request): Promise<AppUserRow> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    throw new Error("Not authenticated");
  }
  const clerkUserId = auth.userId;

  const existing = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (existing[0]) return existing[0];

  // Fetch profile from Clerk for display.
  let email: string | null = null;
  let displayName: string | null = null;
  try {
    const u = await clerkClient.users.getUser(clerkUserId);
    email = u.emailAddresses?.[0]?.emailAddress ?? null;
    displayName =
      [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
      u.username ||
      null;
  } catch {
    /* ignore – we still create the row */
  }

  // Bootstrap: any approved internal user yet?
  const adminCheck = await db
    .select({ id: appUsersTable.id })
    .from(appUsersTable)
    .where(
      and(
        eq(appUsersTable.role, "internal"),
        eq(appUsersTable.status, "approved"),
      ),
    )
    .limit(1);
  const isFirstUser = adminCheck.length === 0;

  const [row] = await db
    .insert(appUsersTable)
    .values({
      clerkUserId,
      email,
      displayName,
      role: isFirstUser ? "internal" : "external",
      status: isFirstUser ? "approved" : "pending",
      approvedAt: isFirstUser ? new Date() : null,
      approvedBy: isFirstUser ? "bootstrap" : null,
    })
    .returning();

  // Auto-link by email: 招待された 職人 / 社員 のメールアドレスが一致したら
  // appUserId を自動でセット。ユーザー管理画面で承認するだけで紐付けが完了する。
  if (email) {
    const lower = email.toLowerCase();
    await db
      .update(staffTable)
      .set({ appUserId: row.id })
      .where(and(eq(staffTable.email, lower), isNull(staffTable.appUserId)));
    await db
      .update(employeesTable)
      .set({ appUserId: row.id })
      .where(
        and(eq(employeesTable.email, lower), isNull(employeesTable.appUserId)),
      );
  }

  return row;
}

/** Look up linked staff / employee names for an app user (for UI display). */
export async function getLinkedRecords(appUserId: string) {
  const [staff] = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .where(eq(staffTable.appUserId, appUserId))
    .limit(1);
  const [employee] = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(eq(employeesTable.appUserId, appUserId))
    .limit(1);
  return {
    linkedStaffId: staff?.id ?? null,
    linkedStaffName: staff?.name ?? null,
    linkedEmployeeId: employee?.id ?? null,
    linkedEmployeeName: employee?.name ?? null,
  };
}

/**
 * Middleware: require the caller to be an approved app user (any role).
 * Use AFTER /me so pending users can still discover their own status.
 */
export async function requireApproved(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const me = await getOrCreateAppUser(req);
    if (me.status !== "approved") {
      res.status(403).json({ error: "Forbidden: 承認待ちのアカウントです" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Middleware: require the caller to be an approved internal admin.
 * Use AFTER the global requireAuth.
 */
export async function requireInternal(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const me = await getOrCreateAppUser(req);
    if (me.role !== "internal" || me.status !== "approved") {
      res.status(403).json({ error: "Forbidden: 社内権限が必要です" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function serializeAppUser(
  u: AppUserRow,
  linked?: {
    linkedStaffId: string | null;
    linkedStaffName: string | null;
    linkedEmployeeId: string | null;
    linkedEmployeeName: string | null;
  },
) {
  return {
    id: u.id,
    clerkUserId: u.clerkUserId,
    email: u.email,
    displayName: u.displayName,
    role: u.role as "internal" | "external",
    status: u.status as "pending" | "approved",
    approvedAt: u.approvedAt ? u.approvedAt.toISOString() : null,
    approvedBy: u.approvedBy,
    createdAt: u.createdAt.toISOString(),
    linkedStaffId: linked?.linkedStaffId ?? null,
    linkedStaffName: linked?.linkedStaffName ?? null,
    linkedEmployeeId: linked?.linkedEmployeeId ?? null,
    linkedEmployeeName: linked?.linkedEmployeeName ?? null,
  };
}
