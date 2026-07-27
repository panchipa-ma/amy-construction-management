---
name: Clerk signals stale status
description: Clerk expo signals useSignIn — never gate finalize() on signIn.status right after an async auth call
---

**Rule:** With Clerk's signals-style `useSignIn` (@clerk/expo 3.x), do NOT check `signIn.status === "complete"` immediately after `ticket()` / `verifyCode()` etc. The hook value is a render-time snapshot and can still hold the old status, producing false "login didn't complete" errors even though the session was created. Instead, when the call returns without `error`, call `signIn.finalize()` directly inside try/catch and handle both a thrown error and a returned `{ error }`.

**Why:** Apple review demo login on device showed 「ログインが完了しませんでした。」 despite the server-side flow being verified complete via curl — the only failing layer was the stale status gate.

**How to apply:** Any Clerk sign-in/sign-up flow in the mobile app (ticket, email OTP, sign-up verify). Finalize-first, status check never.

**Escalation (confirmed on device):** even finalize-first failed for the ticket strategy — `finalize()` threw "Cannot finalize sign-in without a created session" on device although prod logs showed the sign_ins POST returned 200 (no session-activation requests followed). The reliable fix is to bypass signals entirely for ticket login: `import { useSignIn } from "@clerk/expo/legacy"` → `signIn.create({ strategy: "ticket", ticket })` → `setActive({ session: res.createdSessionId })`. Mixing legacy + signals hooks in one component is safe (same ClerkProvider). Diagnostic signature in prod logs: sign_ins 200 with zero follow-up client/session requests = client-side failure after a successful API round-trip.

Also: Hermes bundles store Japanese strings UTF-16LE — ASCII `grep`/`strings` on main.jsbundle gives false negatives; search UTF-16 (e.g. python `s.encode('utf-16-le')`).
