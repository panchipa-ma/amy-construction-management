---
name: Expo Launch build numbers
description: Preventing an Expo Launch submission from using a stale native build number when TestFlight already has newer builds.
---

When a TestFlight resubmission must follow an existing build, make the intended iOS build number explicit in the mobile configuration and avoid relying on a stale remote auto-increment counter.

**Why:** Expo Launch can create a low-numbered binary even when the App Store Connect record already contains substantially higher TestFlight builds. The result does not replace the existing TestFlight candidate and can create misleading “published” status.

**How to apply:** Before launching a resubmission, compare the highest TestFlight build with the generated Expo Launch job version. Configure the next build number to be greater than the current maximum, then only publish once the job is expected to report that number.