---
name: Staff ↔ app_user email linkage & external API access
description: How external 職人 accounts link to staff records and which API endpoints external users depend on — constraints that must not be broken.
---

# Staff ↔ app_user linkage is by EMAIL, not a foreign key

External 職人 app accounts (`app_users`) are linked to `staff` records by **matching email** (`lower(staff.email) = lower(app_users.email)`), so internally-created 工程表/出面 (project phases) auto-reflect to the linked 職人's app. `staff.email` and `employees.email` are the linkage keys.

**Why:** An earlier approach added `app_user_id` FK columns to `staff`/`employees`, then was reverted. Those orphaned `app_user_id` columns still exist in the DB but have **no code references** — left untouched on purpose (dropping = needless data loss). Do **not** run `drizzle-kit push` blindly: it wants to drop those columns and hangs on the interactive prompt. Apply schema changes via direct SQL `ALTER` when needed.

# External-user API access contract (do NOT break)

External (role `external`) users legitimately depend on these endpoints — do **not** blanket `requireInternal` on their routers:
- `GET /staff` — used by vendor invoice/quote forms (web + mobile).
- `GET /projects` — vendor forms + schedule/出面.
- `GET /project-phases/overview` — the **only** phase read endpoint external users get; it is filtered server-side to phases whose staff email matches the caller. All other phase endpoints (`GET /projects/:id/phases`, phase POST/PATCH/DELETE) are `requireInternal`.

**PII guard:** `GET /staff` strips `email` (the linkage key) from the response for external users; internal sees it.

**How to apply:** When adding/scoping phase or staff endpoints, keep `/project-phases/overview` external-safe and everything else internal. External phase read must go through overview, never per-project. `/my-schedule` (web) and the mobile schedule tab consume `useListAllProjectPhases` (= overview). Do not link external UIs to `/projects/:id` — external users are redirected away from it.
