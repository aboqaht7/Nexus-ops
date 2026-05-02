import { Router, type IRouter } from "express";
import { join, resolve, extname, sep } from "path";
import { existsSync, statSync, readFileSync } from "fs";
import { getBot, getBotDir, isWebProject } from "../lib/bot-manager.js";

const router: IRouter = Router();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/**
 * Static preview for web/game/web-app projects.
 * Path: /api/preview/:botId/* (and /api/preview/:botId → index.html)
 *
 * NOTE: This sits under /api so it's routed by the existing API server proxy
 * config — no extra artifact.toml changes required.
 */
router.get("/preview/:botId/*splat", (req, res): void => {
  serve(req.params.botId, (req.params as { splat?: string[] }).splat?.join("/") ?? "", res);
});

router.get("/preview/:botId", (req, res): void => {
  serve(req.params.botId, "", res);
});

function serve(botId: string, rawSubpath: string, res: import("express").Response): void {
  const bot = getBot(botId);
  if (!bot) { res.status(404).send("Project not found"); return; }
  if (!isWebProject(bot.projectType)) {
    res.status(400).send("This project type does not support web preview");
    return;
  }

  const dir = resolve(getBotDir(botId));
  const dirWithSep = dir.endsWith(sep) ? dir : dir + sep;

  // Resolve full target path then verify it stays under the bot's directory
  const candidate = rawSubpath?.trim() ? rawSubpath : "index.html";
  let target = resolve(join(dir, candidate));

  // Path-traversal guard: target must be inside dir (or equal to dir for index)
  if (target !== dir && !target.startsWith(dirWithSep)) {
    res.status(403).send("Forbidden");
    return;
  }

  // Directory → serve its index.html
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = resolve(join(target, "index.html"));
    if (!target.startsWith(dirWithSep)) {
      res.status(403).send("Forbidden");
      return;
    }
  }

  if (!existsSync(target) || !statSync(target).isFile()) {
    res.status(404).send("File not found in project");
    return;
  }

  const ext = extname(target).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";

  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(readFileSync(target));
}

export default router;
