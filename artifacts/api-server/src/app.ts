import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { createCorsOriginHandler } from "./lib/corsOrigins";

const app: Express = express();

// Replit Autoscale deployments sit behind exactly one reverse proxy hop.
// Without this, Express ignores X-Forwarded-For entirely and req.ip is
// always the proxy's own address for every request — so the per-IP rate
// limiter in routes/review-login.ts ends up sharing a single bucket across
// all callers instead of limiting each client individually. Trusting 1 hop
// makes req.ip resolve to the real client IP while still only trusting the
// proxy Replit itself controls (a client can't spoof past that boundary by
// sending its own X-Forwarded-For).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Was `origin: true` (reflects any Origin) + `credentials: true` — allowed
// any website to make credentialed cross-site requests. Now restricted to
// AMY's actual domain(s) (REPLIT_DOMAINS, set by the deployment platform),
// the workspace dev domain, and localhost in non-production. See
// lib/corsOrigins.ts.
app.use(cors({ credentials: true, origin: createCorsOriginHandler() }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
