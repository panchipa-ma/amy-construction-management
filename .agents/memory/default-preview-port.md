---
name: Default Preview port
description: Why AMY Web must own the workspace's default external Preview port.
---

AMY Web must remain the service assigned to the workspace's default external port 80. Secondary services may use other external ports.

**Why:** The generic editor Preview opens external port 80. When an inactive secondary service owned that port, AMY still worked through artifact routing but the user's embedded Preview stayed blank.

**How to apply:** When changing workspace ports or adding services, preserve AMY Web as the port-80 target and verify the root Preview URL, entry JavaScript, CSS, and browser console after restarting its managed workflow.