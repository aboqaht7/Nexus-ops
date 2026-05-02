import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware.js";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk proxy MUST be mounted before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Attach Clerk auth to every request (sets req.auth)
app.use(clerkMiddleware());

// Apple Pay domain verification — must be served at this exact path
app.get("/.well-known/apple-developer-merchantid-domain-association", (_req, res) => {
  try {
    const filePath = resolve(__dirname, "apple-developer-merchantid-domain-association");
    const content = readFileSync(filePath);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(content);
  } catch {
    res.status(404).send("Not found");
  }
});

app.use("/api", router);

export default app;
