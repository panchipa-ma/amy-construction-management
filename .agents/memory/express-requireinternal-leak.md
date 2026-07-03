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

**Separation model (社内/社外) after hardening:** the user requires internal and
external permissions stay strictly separate at the API layer, not just in the UI.

Internal-only (path-gated `requireInternal` in index.ts): `/dashboard`,
`/customers`, `/employees`, `/quotes` (sales), `/invoices` (sales), `/print`,
`/cost-entries`, `/receipts`, `/progress-logs`, `/project-photos`,
`/staff/assignments`, `/commissions`. External users never call these — verified
against `EXTERNAL_ALLOWED_PREFIXES` (role.tsx) and the external mobile/web
screens' hooks.

External-accessible (承認済のみ): `projects`, `staff`, `schedule`,
`vendor-invoices`, `vendor-quotes`, `project-phases` (overview only), `ocr`.
- `projects` + `staff` list reads stay OPEN because 職人 must pick a project and
  assign a staff when creating vendor invoices/quotes (`useListProjects` /
  `useListStaff`). Their **writes** (POST/PATCH/DELETE) are gated per-route with
  `requireInternal` inside projects.ts / staff.ts (can't path-gate — same path,
  GET must stay open).
- `staff` GET strips email for external; `schedule` / `vendor-*` filter by
  `created_by`; `phases` external = overview only.

**Known residual (accepted, needs schema change to fix):** `GET /projects`
returns financial fields (`contractAmount`, `plannedCost`, `actualCost`, rate
fields) to external users. Stripping them requires making those fields nullable
in openapi.yaml (they're `required`/non-null) + codegen, which ripples `number →
number|null` across internal screens. Deferred as a larger, riskier change.
