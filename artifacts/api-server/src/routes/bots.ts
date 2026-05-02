import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { join, extname, basename } from "path";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { getAuth } from "@clerk/express";
import {
  listBots,
  getBot,
  deleteBot,
  startBot,
  stopBot,
  restartBot,
  getBotLogs,
  getStats,
  registerBot,
  getBotFilesDir,
  PROJECT_TYPES,
  type BotLanguage,
  type ProjectType,
} from "../lib/bot-manager.js";
import { getUserLimits } from "../lib/subscriptions.js";
import {
  ListBotsResponse,
  GetBotResponse,
  GetBotLogsResponse,
  GetBotsStatsResponse,
  StartBotResponse,
  StopBotResponse,
  RestartBotResponse,
  GetBotParams,
  DeleteBotParams,
  StartBotParams,
  StopBotParams,
  RestartBotParams,
  GetBotLogsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function getUserId(req: Request): string | undefined {
  return getAuth(req).userId ?? undefined;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getBotFilesDir());
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const safe = basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `${safe}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (ext === ".js" || ext === ".py" || ext === ".mjs" || ext === ".cjs") {
      cb(null, true);
    } else {
      cb(new Error("Only .js, .mjs, .cjs, and .py files are allowed"));
    }
  },
});

router.get("/bots/stats", (_req, res): void => {
  const stats = getStats();
  res.json(GetBotsStatsResponse.parse(stats));
});

router.get("/bots", (req, res): void => {
  const userId = getUserId(req);
  const bots = listBots(userId);
  res.json(ListBotsResponse.parse(bots));
});

router.post(
  "/bots/upload",
  upload.single("file"),
  (req, res): void => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const name = (req.body as { name?: string }).name?.trim();
    if (!name) {
      res.status(400).json({ error: "Bot name is required" });
      return;
    }

    const userId = getUserId(req);

    // Enforce plan limits
    const limits = getUserLimits(userId ?? "");
    if (limits.maxBots !== -1) {
      const existing = listBots(userId);
      if (existing.length >= limits.maxBots) {
        res.status(403).json({
          error: "PLAN_LIMIT",
          message: `وصلت للحد الأقصى من البوتات في خطتك الحالية (${limits.maxBots} بوت). رقّ خطتك للمتابعة.`,
          maxBots: limits.maxBots,
        });
        return;
      }
    }

    // Read code from multer-saved flat file, then registerBot creates isolated dir
    const flatPath = join(getBotFilesDir(), req.file.filename);
    const code = existsSync(flatPath) ? readFileSync(flatPath, "utf-8") : "";
    const ext = extname(req.file.filename).toLowerCase();
    const lang: BotLanguage = ext === ".py" ? "python" : "javascript";

    const bot = registerBot(name, req.file.filename, code, lang, userId);

    // Remove flat file — registerBot wrote it into isolated dir
    try { if (existsSync(flatPath)) unlinkSync(flatPath); } catch {}

    res.status(201).json(bot);
  }
);

// POST /bots/create-from-code — create project from text content (for templates / agent)
router.post("/bots/create-from-code", (req, res): void => {
  const { name, code, language, projectType } = req.body as {
    name?: string;
    code?: string;
    language?: string;
    projectType?: string;
  };

  if (!name?.trim()) { res.status(400).json({ error: "Project name is required" }); return; }

  const userId = getUserId(req);

  const limits = getUserLimits(userId ?? "");
  if (limits.maxBots !== -1) {
    const existing = listBots(userId);
    if (existing.length >= limits.maxBots) {
      res.status(403).json({
        error: "PLAN_LIMIT",
        message: `وصلت للحد الأقصى من المشاريع في خطتك الحالية (${limits.maxBots}). رقّ خطتك للمتابعة.`,
        maxBots: limits.maxBots,
      });
      return;
    }
  }

  const type: ProjectType = (PROJECT_TYPES as string[]).includes(projectType ?? "")
    ? (projectType as ProjectType)
    : "discord-bot";

  // Web projects default to HTML; api-server/script default to language; bots inferred from `language`
  let lang: BotLanguage;
  let filename: string;
  let starter = code?.trim() ?? "";

  if (type === "website" || type === "game" || type === "web-app") {
    lang = "javascript";
    filename = "index.html";
    if (!starter) starter = STARTER_TEMPLATES[type](name);
  } else if (type === "python-script") {
    lang = "python";
    filename = "main.py";
    if (!starter) starter = STARTER_TEMPLATES[type](name);
  } else if (type === "api-server") {
    lang = language === "python" ? "python" : "javascript";
    filename = lang === "python" ? "main.py" : "index.js";
    if (!starter) starter = STARTER_TEMPLATES["api-server-" + lang as keyof typeof STARTER_TEMPLATES](name);
  } else {
    // discord-bot
    lang = language === "python" ? "python" : "javascript";
    filename = lang === "python" ? "main.py" : "index.js";
    if (!starter) starter = STARTER_TEMPLATES["discord-bot-" + lang as keyof typeof STARTER_TEMPLATES](name);
  }

  const bot = registerBot(name.trim(), filename, starter, lang, userId, type);
  res.status(201).json(bot);
});

/* ── Starter templates by project type ───────────────────────────────── */
const STARTER_TEMPLATES: Record<string, (name: string) => string> = {
  "website": (name) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 100vh; display: grid; place-items: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; text-align: center; padding: 2rem;
    }
    h1 { font-size: clamp(2rem, 6vw, 4rem); margin-bottom: 1rem; }
    p { font-size: 1.25rem; opacity: 0.9; max-width: 600px; }
  </style>
</head>
<body>
  <main>
    <h1>${name}</h1>
    <p>Your website is live. Ask Agent-4 to build whatever you imagine.</p>
  </main>
</body>
</html>
`,
  "game": (name) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${name}</title>
  <style>
    body { margin: 0; background: #111; display: grid; place-items: center; min-height: 100vh; font-family: sans-serif; color: white; }
    canvas { background: #222; border: 2px solid #444; }
    .ui { position: fixed; top: 10px; left: 10px; }
  </style>
</head>
<body>
  <div class="ui">Score: <span id="score">0</span></div>
  <canvas id="game" width="800" height="600"></canvas>
  <script>
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    let x = 400, y = 300, vx = 3, vy = 2, score = 0;
    function loop() {
      ctx.fillStyle = "#222"; ctx.fillRect(0, 0, 800, 600);
      x += vx; y += vy;
      if (x < 20 || x > 780) { vx *= -1; score++; document.getElementById("score").textContent = score; }
      if (y < 20 || y > 580) { vy *= -1; score++; document.getElementById("score").textContent = score; }
      ctx.fillStyle = "#F26207"; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
      requestAnimationFrame(loop);
    }
    loop();
  </script>
</body>
</html>
`,
  "web-app": (name) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${name}</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    function App() {
      const [count, setCount] = React.useState(0);
      return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">${name}</h1>
            <p className="text-gray-500 mb-6">Your React app is live</p>
            <div className="text-6xl font-bold text-orange-600 mb-6">{count}</div>
            <button onClick={() => setCount(c => c + 1)}
              className="bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700">
              Click me
            </button>
          </div>
        </div>
      );
    }
    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  </script>
</body>
</html>
`,
  "python-script": (name) => `# ${name} — Python script
# Ask Agent-4 to extend this script with your logic.

def main():
    print("Hello from ${name}!")
    # Your code here

if __name__ == "__main__":
    main()
`,
  "api-server-javascript": (name) => `// ${name} — Express API server
const express = require("express");
const app = express();
app.use(express.json());

app.get("/", (_req, res) => res.json({ name: "${name}", status: "ok" }));
app.get("/api/hello", (_req, res) => res.json({ message: "Hello from ${name}!" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(\`API listening on port \${PORT}\`));
`,
  "api-server-python": (name) => `# ${name} — FastAPI server
from fastapi import FastAPI
import os
import uvicorn

app = FastAPI(title="${name}")

@app.get("/")
def root():
    return {"name": "${name}", "status": "ok"}

@app.get("/api/hello")
def hello():
    return {"message": "Hello from ${name}!"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)
`,
  "discord-bot-javascript": (name) => `// ${name} — Discord bot (discord.js v14)
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", () => {
  console.log(\`✅ \${client.user.tag} is online\`);
});

client.login(process.env.BOT_TOKEN);
`,
  "discord-bot-python": (name) => `# ${name} — Discord bot (discord.py)
import os
import discord

intents = discord.Intents.default()
client = discord.Client(intents=intents)

@client.event
async def on_ready():
    print(f"✅ {client.user} is online")

client.run(os.environ["BOT_TOKEN"])
`,
};

router.get("/bots/:id", (req, res): void => {
  const params = GetBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = getBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(GetBotResponse.parse(bot));
});

router.delete("/bots/:id", (req, res): void => {
  const params = DeleteBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const ok = deleteBot(params.data.id);
  if (!ok) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/bots/:id/start", (req, res): void => {
  const params = StartBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = startBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(StartBotResponse.parse(bot));
});

router.post("/bots/:id/stop", (req, res): void => {
  const params = StopBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = stopBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(StopBotResponse.parse(bot));
});

router.post("/bots/:id/restart", (req, res): void => {
  const params = RestartBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const bot = restartBot(params.data.id);
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(RestartBotResponse.parse(bot));
});

router.get("/bots/:id/logs", (req, res): void => {
  const params = GetBotLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const logs = getBotLogs(params.data.id);
  if (!logs) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(GetBotLogsResponse.parse({ id: params.data.id, logs }));
});

export default router;
