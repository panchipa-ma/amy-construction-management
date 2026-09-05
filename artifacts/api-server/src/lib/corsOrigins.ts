/**
 * CORS allow-list for the API.
 *
 * Previously app.ts used `cors({ credentials: true, origin: true })`, which
 * reflects whatever Origin header the caller sends and also allows
 * credentials (cookies) — i.e. it trusts every website on the internet
 * with a credentialed request. Since Clerk's session can be carried by a
 * cookie (not only the Authorization: Bearer header — see
 * ClerkBearerTokenBridge in replit.md), that combination lets a malicious
 * page make authenticated cross-site requests against this API using the
 * signed-in user's browser session.
 *
 * This module builds an explicit allow-list instead, derived from:
 *  - REPLIT_DOMAINS — set automatically by the Replit deployment platform
 *    to whatever domain(s) this deployment is actually reachable at,
 *    custom domain included once one is linked. This is the authoritative
 *    source for "AMY's real domain" without hardcoding a guess here.
 *  - REPLIT_DEV_DOMAIN — the workspace's own dev preview domain.
 *  - CORS_EXTRA_ORIGINS — an optional escape hatch (comma-separated full
 *    origins, e.g. "https://staging.example.com") for any domain not
 *    reflected by the two above.
 *  - localhost — only outside production (NODE_ENV !== "production"), for
 *    `pnpm dev`.
 */

function addDomain(origins: Set<string>, domain: string | undefined): void {
  const d = domain?.trim();
  if (!d) return;
  origins.add(`https://${d}`);
}

function addOrigin(origins: Set<string>, origin: string | undefined): void {
  const o = origin?.trim();
  if (!o) return;
  origins.add(o.replace(/\/$/, ""));
}

export function buildAllowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const origins = new Set<string>();

  for (const domain of (env.REPLIT_DOMAINS ?? "").split(",")) {
    addDomain(origins, domain);
  }
  addDomain(origins, env.REPLIT_DEV_DOMAIN);

  for (const origin of (env.CORS_EXTRA_ORIGINS ?? "").split(",")) {
    addOrigin(origins, origin);
  }

  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:5173");
  }

  return origins;
}

/**
 * cors() origin callback: allow no-Origin requests (server-to-server,
 * curl, same-origin navigations don't send Origin either) and requests
 * from an allowed origin; reject everything else.
 */
export function createCorsOriginHandler(
  env: NodeJS.ProcessEnv = process.env,
): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void {
  const allowed = buildAllowedOrigins(env);
  return (origin, callback) => {
    if (!origin || allowed.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  };
}
