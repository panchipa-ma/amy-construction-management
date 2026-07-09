import { Router, type IRouter } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, appUsersTable } from "@workspace/db";
import {
  CheckReviewLoginBody,
  CheckReviewLoginResponse,
  ReviewLoginBody,
  ReviewLoginResponse,
} from "@workspace/api-zod";

// App Store 審査用デモアカウントのパスワードログイン。
// 本番の Clerk はメール認証コード (OTP) のみのため、審査員は受信箱を持たず
// ログインできない。REVIEW_DEMO_EMAIL / REVIEW_DEMO_PASSWORD が一致した場合
// のみ、Clerk sign-in token (ticket) を発行してワンタップでサインインさせる。
// どちらの env も未設定なら機能自体が無効 (404 相当の挙動)。
const router: IRouter = Router();

function demoEmail(): string | null {
  const v = process.env.REVIEW_DEMO_EMAIL?.trim().toLowerCase();
  return v || null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// 簡易レート制限 (in-memory): IP ごとに 15 分間で 10 回まで。
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  if (attempts.size > 10000) {
    for (const [k, v] of attempts) {
      if (now > v.resetAt) attempts.delete(k);
    }
  }
  return rec.count > RATE_MAX;
}

router.post("/review-login/check", async (req, res): Promise<void> => {
  const body = CheckReviewLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const email = demoEmail();
  const isReviewAccount =
    !!email &&
    !!process.env.REVIEW_DEMO_PASSWORD &&
    body.data.email.trim().toLowerCase() === email;
  res.json(CheckReviewLoginResponse.parse({ isReviewAccount }));
});

router.post("/review-login", async (req, res): Promise<void> => {
  if (rateLimited(req.ip ?? "unknown")) {
    res.status(429).json({ error: "試行回数が多すぎます。しばらくしてからお試しください" });
    return;
  }
  const body = ReviewLoginBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const email = demoEmail();
  const password = process.env.REVIEW_DEMO_PASSWORD;
  if (
    !email ||
    !password ||
    body.data.email.trim().toLowerCase() !== email ||
    !safeEqual(body.data.password, password)
  ) {
    res.status(401).json({ error: "メールアドレスまたはパスワードが違います" });
    return;
  }

  try {
    // デモユーザーが Clerk に無ければ作成 (受信箱不要 — OTP を使わないため)。
    const list = await clerkClient.users.getUserList({
      emailAddress: [email],
    });
    let user = list.data[0];
    if (!user) {
      user = await clerkClient.users.createUser({
        emailAddress: [email],
        firstName: "App",
        lastName: "Review",
        skipPasswordRequirement: true,
      });
    }

    // app_users 行を承認済み external として用意 (審査員は職人ロールを見る)。
    const [row] = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, user.id));
    if (!row) {
      await db.insert(appUsersTable).values({
        clerkUserId: user.id,
        email,
        displayName: "App Review",
        role: "external",
        status: "approved",
        approvedAt: new Date(),
        approvedBy: "review-login",
      });
    } else if (row.status !== "approved") {
      await db
        .update(appUsersTable)
        .set({ status: "approved", approvedAt: new Date(), approvedBy: "review-login" })
        .where(eq(appUsersTable.id, row.id));
    }

    const token = await clerkClient.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 600,
    });
    res.json(ReviewLoginResponse.parse({ token: token.token }));
  } catch (e) {
    req.log.error({ err: e }, "review login failed");
    res.status(500).json({ error: "ログインに失敗しました" });
  }
});

export default router;
