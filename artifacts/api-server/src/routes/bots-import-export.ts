import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "fs";
import { join, extname, basename } from "path";
import { randomUUID } from "crypto";
import {
  registerBot,
  getBot,
  getBotFilesDir,
  type BotLanguage,
} from "../lib/bot-manager";
import {
  ImportBotFromGithubBody,
  ImportBotFromUrlBody,
  ExportBotToGithubParams,
  ExportBotToGithubBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CLONE_TIMEOUT_MS = 60_000;
const TMP_DIR = join(process.cwd(), "data", "tmp");

function ensureTmp() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
}

function spawnPromise(
  cmd: string,
  args: string[],
  options: { timeout?: number; env?: NodeJS.ProcessEnv; cwd?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options.env ?? process.env,
      cwd: options.cwd,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    const timer = options.timeout
      ? setTimeout(() => {
          proc.kill("SIGKILL");
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }, options.timeout)
      : null;

    proc.on("exit", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Command failed with exit code ${code}`));
      }
    });
  });
}

router.post("/bots/import/github", async (req, res): Promise<void> => {
  const parsed = ImportBotFromGithubBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, repoUrl, mainFile, branch, token } = parsed.data;
  ensureTmp();

  const cloneDir = join(TMP_DIR, `clone_${randomUUID()}`);

  try {
    const cloneUrl = token
      ? repoUrl.replace("https://", `https://${token}@`)
      : repoUrl;

    const cloneArgs = ["clone", "--depth", "1"];
    if (branch) cloneArgs.push("--branch", branch);
    cloneArgs.push(cloneUrl, cloneDir);

    req.log.info({ repoUrl, mainFile }, "Cloning GitHub repo");
    await spawnPromise("git", cloneArgs, { timeout: CLONE_TIMEOUT_MS });

    const sourceFile = join(cloneDir, mainFile);
    if (!existsSync(sourceFile)) {
      res.status(400).json({ error: `File "${mainFile}" not found in repository` });
      return;
    }

    const ext = extname(mainFile).toLowerCase();
    if (![".js", ".mjs", ".cjs", ".py"].includes(ext)) {
      res.status(400).json({ error: "Only .js, .mjs, .cjs and .py files are supported" });
      return;
    }

    const safeName = basename(mainFile, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const destFilename = `${safeName}_${Date.now()}${ext}`;
    const destPath = join(getBotFilesDir(), destFilename);

    const content = readFileSync(sourceFile);
    writeFileSync(destPath, content);

    const bot = registerBot(name, destFilename);
    req.log.info({ botId: bot.id, repoUrl }, "Bot imported from GitHub");

    res.status(201).json({ bot, message: `Bot imported from ${repoUrl}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Clone failed";
    req.log.error({ err }, "GitHub import failed");
    res.status(400).json({ error: msg });
  } finally {
    try {
      if (existsSync(cloneDir)) rmSync(cloneDir, { recursive: true, force: true });
    } catch {
    }
  }
});

router.post("/bots/import/url", async (req, res): Promise<void> => {
  const parsed = ImportBotFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, fileUrl } = parsed.data;

  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const ext = extname(url.pathname).toLowerCase();
  if (![".js", ".mjs", ".cjs", ".py"].includes(ext)) {
    res.status(400).json({ error: "URL must point to a .js, .mjs, .cjs or .py file" });
    return;
  }

  try {
    req.log.info({ fileUrl }, "Fetching bot file from URL");
    const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      res.status(400).json({ error: `Failed to fetch file: HTTP ${response.status}` });
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const safeName = basename(url.pathname, ext).replace(/[^a-zA-Z0-9_-]/g, "_") || "bot";
    const destFilename = `${safeName}_${Date.now()}${ext}`;
    const destPath = join(getBotFilesDir(), destFilename);

    writeFileSync(destPath, buffer);

    const bot = registerBot(name, destFilename);
    req.log.info({ botId: bot.id, fileUrl }, "Bot imported from URL");

    res.status(201).json({ bot, message: `Bot imported from ${fileUrl}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Download failed";
    req.log.error({ err }, "URL import failed");
    res.status(400).json({ error: msg });
  }
});

router.get("/bots/:id/download", (req, res): void => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const bot = getBot(rawId);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const filePath = join(getBotFilesDir(), bot.filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Bot file not found on disk" });
    return;
  }

  res.download(filePath, bot.filename);
});

router.post("/bots/:id/export/github", async (req, res): Promise<void> => {
  const params = ExportBotToGithubParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ExportBotToGithubBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const bot = getBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const { repoUrl, token, path: destPath, commitMessage } = body.data;
  ensureTmp();

  const workDir = join(TMP_DIR, `export_${randomUUID()}`);

  try {
    const cloneUrl = repoUrl.replace("https://", `https://${token}@`);

    req.log.info({ repoUrl, botId: bot.id }, "Cloning repo for export");
    await spawnPromise("git", ["clone", "--depth", "1", cloneUrl, workDir], {
      timeout: CLONE_TIMEOUT_MS,
    });

    const targetRelPath = destPath ? destPath.replace(/\\/g, "/") : bot.filename;
    const targetAbsPath = join(workDir, targetRelPath);

    const targetDir = join(workDir, ...targetRelPath.split("/").slice(0, -1));
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

    const sourcePath = join(getBotFilesDir(), bot.filename);
    const content = readFileSync(sourcePath);
    writeFileSync(targetAbsPath, content);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "NexusOps Bot Host",
      GIT_AUTHOR_EMAIL: "bot@nexusops.repl.co",
      GIT_COMMITTER_NAME: "NexusOps Bot Host",
      GIT_COMMITTER_EMAIL: "bot@nexusops.repl.co",
    };

    await spawnPromise("git", ["add", targetRelPath], { cwd: workDir, env });
    await spawnPromise(
      "git",
      ["commit", "-m", commitMessage ?? `Update ${bot.name} via NexusOps`],
      { cwd: workDir, env }
    );
    await spawnPromise("git", ["push"], { cwd: workDir, env, timeout: CLONE_TIMEOUT_MS });

    const repoHtmlUrl = repoUrl.replace(/\.git$/, "");
    req.log.info({ repoUrl, botId: bot.id }, "Bot exported to GitHub");

    res.json({
      success: true,
      url: `${repoHtmlUrl}/blob/main/${targetRelPath}`,
      message: `Bot "${bot.name}" pushed to ${repoUrl}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Export failed";
    req.log.error({ err }, "GitHub export failed");

    const isAuthError =
      msg.includes("Authentication failed") ||
      msg.includes("403") ||
      msg.includes("Permission denied");
    const isNoChanges = msg.includes("nothing to commit");

    if (isNoChanges) {
      res.json({ success: true, message: "No changes — file is already up to date on GitHub" });
      return;
    }
    if (isAuthError) {
      res.status(400).json({ error: "Authentication failed — check your GitHub token and permissions" });
      return;
    }
    res.status(400).json({ error: msg });
  } finally {
    try {
      if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    } catch {
    }
  }
});

export default router;
