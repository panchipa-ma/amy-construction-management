---
name: Apple App Store review rejections (AMY mobile)
description: Recurring App Store rejection reasons for the Expo iOS app and the decided fixes
---

# Apple App Store review — recurring rejections & fixes

The Expo iOS app (`jp.amy.kanri`, ASC App ID `6773175332`) was rejected multiple times. Durable lessons:

## 4.8 Login Services (Sign in with Apple)
If the iOS app offers ANY third-party/social login (Google/etc.), Apple requires an equivalent privacy-preserving option (Sign in with Apple).
- **Decision taken:** remove the social login button from the **mobile** app so it offers ONLY first-party auth → guideline 4.8 no longer applies. Email verification code (OTP) is first-party, so it satisfies 4.8. Web is NOT reviewed by Apple, so Google can stay on web.
- **Why:** Adding Sign in with Apple on Replit-managed Clerk *production* requires the user's Apple Developer creds (Team ID, Services ID, Key ID, .p8) configured in the workspace **Auth pane** + Apple Private Email Relay — a user-only action, higher risk of another rejection.

## Mobile auth MUST be email code (OTP), NOT password — root cause of repeated 2.1 demo-login failures
The prod Clerk instance authenticates via **email verification code** (the web login shows a "Check your email / enter code" screen), and prod accounts (created via Google or email code) have **NO password**. The old mobile `sign-in.tsx` used `signIn.password()`, which ALWAYS failed on prod accounts → every reviewer demo login failed → recurring 2.1 rejection.
- **Fix applied:** mobile sign-in AND sign-up converted to passwordless email-code using Clerk future API (`@clerk/expo`):
  - SIGN-IN: `signIn.emailCode.sendCode({ emailAddress })` → `signIn.emailCode.verifyCode({ code })` → if `signIn.status === "complete"` then `signIn.finalize({ navigate })`.
  - SIGN-UP: `signUp.create({ emailAddress })` → `signUp.verifications.sendEmailCode()` → `signUp.verifications.verifyEmailCode({ code })` → `signUp.finalize()`.
  - Keep `<View nativeID="clerk-captcha" />` on the pre-send (email) step for bot protection.
- **Why this also fixes the demo account:** any existing web-created account (incl. the reviewer demo) can now log in on mobile because email code works regardless of whether a password was ever set. No need to create a special email+password prod user anymore.
- **How to apply:** never reintroduce `signIn.password()` / a password field on mobile unless the prod Clerk instance is reconfigured to require passwords. Keep web and mobile on the same email-code strategy (feature parity).

## Modal FormScreen header must add safe-area top inset (post-login trap)
On iOS, screens presented as `presentation: "modal"` with `headerShown: false` and a **custom** in-app header render UNDER the status bar/notch when native screens are disabled (`enableScreens(false)`, set for the iOS 26 tab-bar crash workaround). The shared `components/form/index.tsx` `FormScreen` header used a fixed `paddingTop` → its キャンセル/保存 buttons overlapped the clock/wifi icons and were untappable.
- **Symptom seen on TestFlight:** right after a successful login, the required プロフィール編集 (profile) screen showed Cancel/Save fused into the status bar → reviewer/user stuck (looked like "can't select"). Login itself was actually working.
- **Fix:** `FormScreen` uses `useSafeAreaInsets()` and `paddingTop: insets.top + 12`. Safe because ALL FormScreen consumers are modal + `headerShown:false` (no native header → no double padding). `SafeAreaProvider` already wraps the app root.
- **How to apply:** any custom top header on a headerless/modal Expo screen must add `insets.top`; do NOT assume the modal card leaves a gap — with `enableScreens(false)` modals present full-screen. If a future non-modal screen reuses FormScreen with a native header, gate the inset behind a prop.

## "Buttons visible but tapping does nothing" = router.back() no-op on a replace-entered screen
The forced profile gate (tabs `_layout`) enters the profile screen via `router.replace("/profile")`, so there is **no back stack**. Both save-success and the FormScreen キャンセル button called `router.back()` → silently did nothing. This looks identical to a broken/dead button but the Pressable IS firing.
- **Fix pattern:** never call bare `router.back()` on a screen reachable via replace/gate. Use `if (router.canGoBack()) router.back(); else router.replace(<explicit home>)`. For a REQUIRED screen (profile), the meaningful Cancel is **sign out** → `router.replace("/(auth)/sign-in")` (mirror `pending.tsx` logout), not a loop back into the same gate.
- FormScreen gained an optional `onCancel` prop so a screen can override the generic canGoBack fallback (profile passes the sign-out variant).
- **Also, separately:** with `enableScreens(false)`, `presentation:"modal"` (JS-based modal) has fragile hit-testing on iOS — converted all edit/create screens to normal push (`headerShown:false`, FormScreen provides its own header) as hardening. **Why:** removes a whole class of modal-touch risk before App Review; native push works fine under enableScreens(false).

## 2.1 審査用デモアカウント = パスワード式レビュー専用ログイン (OTP 受信箱問題の恒久解)
Apple 審査員はデモアカウントのメール受信箱を持てないため、OTP-only の Clerk では審査ログイン不可能。
- **Fix:** public API `/api/review-login/check` (email がデモアカウントか判定) + `/api/review-login` (email+password → Clerk sign-in token)。env `REVIEW_DEMO_EMAIL` / `REVIEW_DEMO_PASSWORD` (shared) 一致時のみ。Clerk デモユーザー + approved external app_users 行を find-or-create するので受信箱・事前登録不要。モバイル sign-in は check が true ならパスワード欄に切替 → `signIn.ticket({ ticket })` → `finalize`。
- **Why:** OTP は審査員に届かない。ticket 方式なら Clerk 側の認証設定 (OTP-only) を一切変えずに済む。
- **How to apply:** ブルートフォース対策の in-memory レート制限 (IP 10回/15分) を維持。審査完了後に無効化したければ env を消すだけ (endpoint は 401/false を返すのみになる)。**本番 API に endpoint が必要 → 審査提出前に必ず Publish**。ASC の App Review Information にデモ email/password を記載。

## 5.1.1(v) アカウント自己削除
アカウント作成があるアプリはアプリ内からの完全削除導線が必須。
- **Fix:** `DELETE /api/me` — Clerk ユーザー削除 → 成功後に app_users 行削除 (この順序: 先に DB を消すと失敗時に再サインインで pending external として再作成され role が消える)。UI は Web (プロフィール編集 edit mode) とモバイル (プロフィール画面) 両方に確認ダイアログ付き削除ボタン → 成功後 signOut。

## 1.5 Support URL
The ASC Support URL must be the **actually deployed** domain. `amy-kanri.replit.app` does not exist (404); the live deployment is `interior-design-app.replit.app` and `/support` (and `/privacy`) are **public** routes there (outside the signed-in gate in `artifacts/amy/src/App.tsx` `AppRoutes`). Fix = point ASC Support URL to the live domain, no code change.

## 2.1(b) Business model
The app looks like it may sell content because it shows 見積/請求書 money figures. Reality: private internal B2B tool for one construction company, no IAP, no paid digital content, free accounts approved by admin. This is answered by **replying** in ASC, not a code change.

## 社外(external)ユーザーが本番で全画面 403 = 本番デプロイが古い (コード修正ではなく再公開)
Mobile app は **本番API** (`interior-design-app.replit.app`) を叩く。承認済み external ユーザーで 出面(schedule)タブ →「読み込みに失敗しました」。本番ログで `/api/project-phases/overview` `/api/projects` `/api/vendor-invoices` `/api/vendor-quotes` が全部 403、`/api/me` だけ 200。
- **切り分け:** `requireApproved` は status≠approved で 403 にするが、本番DBで当該ユーザーは role=external / **status=approved**。モバイル承認ゲートも通過済 (status==="pending" の時だけ /pending へ)。→ 承認は問題なし。
- **真因:** 現行ソースは承認済 external に overview=[] (200) / vendor-invoices・quotes は created_by で自分の分 (200) / projects は無ガード (200) を返す。本番が 403 を返すのは、**これら external アクセス許可コミット (例: "Restrict access to vendor invoices and quotes for external users") より前のビルドが本番で動いている**から。dev で直したが本番に publish していなかった。
- **How to apply:** external の本番不具合を見たら、まず本番ログの status code と本番DBの当該ユーザー status を確認。全 API が 403 で me だけ 200 なら「古い本番デプロイ」を疑い、**コードをいじる前に再公開**。新しい 20分の iOS ビルドは不要 (サーバ側 republish のみ)。
