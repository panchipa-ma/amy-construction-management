---
name: EAS production-only runtime error debugging
description: How to diagnose a "works in dev, ErrorBoundary in TestFlight/prod build" JS error in the Expo mobile app
---

# Diagnosing production-only JS runtime errors (Expo / EAS)

When the mobile app launches fine natively but shows the JS ErrorBoundary ("Something went wrong") only in a TestFlight/production build:

- The native iOS26 crash (RNSTabBarController) is a separate, already-fixed issue — an ErrorBoundary screen means the app got past native init, so it's a JS-level thrown error during render.
- **Production hides the real error by default**: `ErrorFallback` only showed details under `__DEV__`, and `_layout.tsx` did not pass `onError`. To diagnose, surface `error.message`+stack in the fallback regardless of `__DEV__` and wire `ErrorBoundary onError` to `console.error`. (This is a temporary diagnostic — revert before final App Store resubmit.)

## Verify whether EAS embedded the env vars (don't guess)
EAS env vars for prod are stored server-side (`eas env:list production`), visibility SECRET. To confirm a given build actually loaded them, query the build's `resolvedEnvironment` — if it's `production`, the `EXPO_PUBLIC_*` prod vars WERE inlined, so a blank-screen is NOT a missing-key problem.

GraphQL (POST https://api.expo.dev/graphql, header `Authorization: Bearer <EXPO_TOKEN>`):
- `{ app { byId(appId:"<projectId>"){ buildsPaginated(first:8){ edges{ node{ ... on Build{ id status appBuildVersion appVersion createdAt resolvedEnvironment } } } } } } }`
- Single build: `{ builds { byId(buildId:"<id>"){ buildProfile resolvedEnvironment distribution logFiles } } }`
- Build log files are returned as signed GCS URLs but are **encrypted/opaque** (not plain gzip) — don't try to parse them; use `resolvedEnvironment` + on-device error text instead.

## Prime suspects for prod-only launch throw (after env confirmed embedded)
**Why:** dev vs prod differ only in env *values* (dev workflow shell vs EAS secrets).
1. `EXPO_PUBLIC_DOMAIN` must point to a **deployed/reachable** API domain, not the Replit dev domain (unreachable from a real device). It feeds `setBaseUrl`.
2. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` malformed (trailing newline) / wrong instance → `ClerkProvider` throws synchronously at init.

## CONFIRMED ROOT CAUSE + FIX
On-device error text: `@clerk/clerk-js: The publishableKey passed to Clerk is invalid (key=pk_live_xxxxx)` → `ClerkProvider` threw synchronously → ErrorBoundary screen. (`resolvedEnvironment=production` had already confirmed the prod env WAS embedded — so it was a bad *value*, not a missing var.)

**Why it happened:** Replit-managed Clerk provisions the prod `pk_live_` key only at *Replit publish time*; it is NOT visible from the dev workspace. This mobile app builds via **EAS directly (not Replit Deploy)**, so prod values must be set manually in EAS env — and the `pk_live_` placeholder that was there was invalid; `EXPO_PUBLIC_CLERK_PROXY_URL` was missing entirely.

**How to get the real live key:** the app must already be published on Replit. Fetch the *prod web* JS bundle and grep it:
- `curl -s https://<app>.replit.app/mobile/` (or `/`) → find `assets/index-*.js` → `curl` that → `rg -o 'pk_live_[A-Za-z0-9_\-]+'`.
- Sanity-check by base64-decoding the part after `pk_live_` — it should decode to `clerk.<app>.replit.app$`.

**The fix (EAS env, production profile):**
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = the real `pk_live_` from the prod bundle (visibility secret)
- `EXPO_PUBLIC_DOMAIN` = `<app>.replit.app` (the published base domain, reachable from device)
- `EXPO_PUBLIC_CLERK_PROXY_URL` = `https://<app>.replit.app/api/__clerk`
- Set with `eas env:create production --force --visibility secret` (cannot flip an existing secret var to plaintext; recreate with --force).

**`eas build --auto-submit` gotcha:** non-interactive auto-submit fails with "Set ascAppId in the submit profile" unless `eas.json` has `submit.production.ios.ascAppId`. Add it once (ASC App ID is numeric, from App Store Connect). The build itself still succeeds even when the auto-submit step fails.

**Long EAS commands from the agent:** `eas build` upload exceeds the 120s bash-tool ceiling and detached/`setsid` processes get killed on tool return. Run it via a temporary Replit **workflow** (configureWorkflow → poll getWorkflowStatus → removeWorkflow); the build registers + continues on EAS servers independently.
