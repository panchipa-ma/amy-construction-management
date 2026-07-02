---
name: Apple App Store review rejections (AMY mobile)
description: Recurring App Store rejection reasons for the Expo iOS app and the decided fixes
---

# Apple App Store review — recurring rejections & fixes

The Expo iOS app (`jp.amy.kanri`, ASC App ID `6773175332`) was rejected multiple times. Durable lessons:

## 4.8 Login Services (Sign in with Apple)
If the iOS app offers ANY third-party/social login (Google/etc.), Apple requires an equivalent privacy-preserving option (Sign in with Apple).
- **Decision taken:** remove the social login button from the **mobile** app so it offers ONLY first-party email/password → guideline 4.8 no longer applies. This is fully code-doable and needs no Apple Developer / Clerk Auth-pane setup.
- **Why:** Adding Sign in with Apple on Replit-managed Clerk *production* requires the user's Apple Developer creds (Team ID, Services ID, Key ID, .p8) configured in the workspace **Auth pane** + Apple Private Email Relay — a user-only action, higher risk of another rejection.
- **How to apply:** the alternative (keep Google + add Apple) is only worth it if the user explicitly wants social login on mobile. Web is NOT reviewed by Apple, so Google can stay on web.

## 2.1 Demo account "verification strategy is not valid for this account"
Means the demo Clerk account was created via Google OAuth and has **no password**, so password login fails.
- **Fix:** create a fresh email+password demo user in the **production** Clerk store (dev workspace only has sk_test, so the agent cannot create prod users — it is a user action). Sign up in the published web app, verify email, then approve + set role internal via `/users`, then complete profile once so the reviewer lands in the app.
- Tip: use a Gmail `+alias` (e.g. `name+review@gmail.com`) so the verification code lands in the same real inbox.

## 1.5 Support URL
The ASC Support URL must be the **actually deployed** domain. `amy-kanri.replit.app` does not exist (404); the live deployment is `interior-design-app.replit.app` and `/support` (and `/privacy`) are **public** routes there (outside the signed-in gate in `artifacts/amy/src/App.tsx` `AppRoutes`). Fix = point ASC Support URL to the live domain, no code change.

## 2.1(b) Business model
The app looks like it may sell content because it shows 見積/請求書 money figures. Reality: private internal B2B tool for one construction company, no IAP, no paid digital content, free accounts approved by admin. This is answered by **replying** in ASC, not a code change.
