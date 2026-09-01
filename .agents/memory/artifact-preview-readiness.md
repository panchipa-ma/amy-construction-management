---
name: Artifact Preview readiness
description: Distinguishing AMY Web server health from Replit Artifact Preview routing and stale frames.
---

Treat Web workflow state, expected-port binding, and Artifact Preview readiness as three separate checks. A previously rendered Mobile frame may remain visible when the Web service has been externally terminated, even though the user reselects the Web artifact.

**Why:** Local HTTP 200 and successful React rendering only prove that the Web server worked at that moment. They do not prove that the user-facing Artifact Preview is currently attached to that server. Web and API have also received simultaneous external SIGTERM without an application crash.

**How to apply:** For a blank AMY Web Preview, first confirm the managed Web workflow is still running on its registered port, then confirm the Web artifact reports Preview-ready, and only then inspect React code. Do not infer Mobile bundle contamination from a stale Mobile frame.