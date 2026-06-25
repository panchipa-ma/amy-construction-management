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
