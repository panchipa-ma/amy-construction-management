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

## 1.5 Support URL
The ASC Support URL must be the **actually deployed** domain. `amy-kanri.replit.app` does not exist (404); the live deployment is `interior-design-app.replit.app` and `/support` (and `/privacy`) are **public** routes there (outside the signed-in gate in `artifacts/amy/src/App.tsx` `AppRoutes`). Fix = point ASC Support URL to the live domain, no code change.

## 2.1(b) Business model
The app looks like it may sell content because it shows 見積/請求書 money figures. Reality: private internal B2B tool for one construction company, no IAP, no paid digital content, free accounts approved by admin. This is answered by **replying** in ASC, not a code change.
