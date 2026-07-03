---
name: Express requireInternal path-scoping
description: Why internal-only Express routers must gate auth by path, not by use(mw, router)
---

# Internal-only Express routers must gate by PATH

In `artifacts/api-server/src/routes/index.ts`, do NOT write
`router.use(requireInternal, someRouter)` to make a router internal-only.

**Why:** In Express, a bare middleware passed alongside a router in
`router.use(mw, router)` is mounted at `/` and runs for **every** subsequent
request, not only the ones `someRouter` handles. Doing it once makes
`requireInternal` leak onto all following routers (projects, customers,
vendor-invoices, schedule, ...). Result: every external (社外) user gets 403 on
their own screens too → the mobile/web app shows 「再試行」 on every screen. This
is invisible to internal users (they pass requireInternal), so it hides until a
real external 職人 account tests it. Confirmed with a minimal Express repro.

**How to apply:** Scope the middleware to the router's own path prefix, mounted
separately from the router:

```ts
router.use("/dashboard", requireInternal);
router.use(dashboardRouter);      // dashboardRouter still defines /dashboard/... internally
```

`requireInternal` then only fires for `/dashboard*`; on non-matching paths it is
skipped and `next()` continues to later routers. Verified: external → /projects
200, /dashboard 403; internal → /dashboard 200.

Only works cleanly because every internal-only router uses a non-colliding
prefix: `/dashboard`, `/employees`, `/print`, `/project-photos`, `/commissions`.
If a future internal router shares a prefix with an external-accessible route
(e.g. nesting under `/projects`), gate it inside the router file instead.

**Security note:** After this fix external users CAN hit /api/projects,
/customers, /invoices etc. via direct API (no created_by filtering there) — this
matches the codebase's existing model (only the 5 routers above are internal;
frontend RoleGuard hides the rest from external UI). Only vendor_invoices /
vendor_quotes / schedule_entries filter by created_by. Tighten later if external
users must not read global project/customer data via API.
