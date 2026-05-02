import { Router, type IRouter, type Request } from "express";
import multer from "multer";
import { join, extname, basename, resolve, sep, relative } from "path";
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync, lstatSync } from "fs";
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
  getBotDir,
  PROJECT_TYPES,
  type BotLanguage,
  type ProjectType,
} from "../lib/bot-manager.js";
import {
  listSecretsMasked,
  setSecret,
  deleteSecret,
  isValidSecretKey,
} from "../lib/secrets.js";
import {
  snapshot as snapshotCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  isValidSha,
} from "../lib/checkpoints.js";
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

// Sanitize the project name before interpolating into HTML / JS / Python
// templates. Strips characters that could break out of attribute, text, JS
// string, or Python string contexts. Falls back to a safe default if empty.
function safeName(raw: string): string {
  const cleaned = raw
    .replace(/[<>"'`$\\{}\r\n\t]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  return cleaned || "My Project";
}

const STARTER_TEMPLATES_RAW: Record<string, (name: string) => string> = {
  "website": (name) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="description" content="${name} — built with NexusOps" />
  <title>${name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #FAF7F2; --fg: #1A1A1A; --muted: #6B6B6B;
      --accent: #F26207; --accent-soft: #FEF1E6;
      --card: #FFFFFF; --border: #ECE7DF;
    }
    html { scroll-behavior: smooth; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg); color: var(--fg); line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1100px; margin: 0 auto; padding: 0 1.5rem; }
    nav {
      position: sticky; top: 0; z-index: 50;
      background: rgba(250,247,242,0.8); backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border); padding: 1rem 0;
    }
    nav .container { display: flex; align-items: center; justify-content: space-between; }
    .logo { font-weight: 800; font-size: 1.25rem; letter-spacing: -0.02em; }
    .logo span { color: var(--accent); }
    .nav-links { display: flex; gap: 2rem; list-style: none; }
    .nav-links a { color: var(--muted); text-decoration: none; font-weight: 500; font-size: 0.95rem; transition: color .2s; }
    .nav-links a:hover { color: var(--fg); }
    .btn {
      display: inline-flex; align-items: center; gap: .5rem;
      padding: .75rem 1.5rem; border-radius: 10px; font-weight: 600;
      text-decoration: none; transition: all .2s; border: none; cursor: pointer; font-size: .95rem;
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: #D9540A; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(242,98,7,0.25); }
    .btn-ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
    .hero { padding: 6rem 0 5rem; text-align: center; }
    .badge {
      display: inline-flex; align-items: center; gap: .5rem;
      padding: .4rem .9rem; background: var(--accent-soft); color: var(--accent);
      border-radius: 999px; font-size: .85rem; font-weight: 600; margin-bottom: 1.5rem;
    }
    .hero h1 {
      font-size: clamp(2.25rem, 6vw, 4rem); font-weight: 800;
      letter-spacing: -0.03em; line-height: 1.1; margin-bottom: 1.25rem;
    }
    .hero h1 em { font-style: normal; color: var(--accent); }
    .hero p {
      font-size: clamp(1rem, 2vw, 1.2rem); color: var(--muted);
      max-width: 620px; margin: 0 auto 2rem;
    }
    .hero-cta { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
    section { padding: 4rem 0; }
    .section-title { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; text-align: center; margin-bottom: .75rem; }
    .section-sub { text-align: center; color: var(--muted); margin-bottom: 3rem; max-width: 520px; margin-left: auto; margin-right: auto; }
    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; }
    .feature {
      background: var(--card); border: 1px solid var(--border);
      padding: 1.75rem; border-radius: 16px; transition: all .25s;
    }
    .feature:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.06); border-color: var(--accent); }
    .feature-icon {
      width: 44px; height: 44px; border-radius: 12px; background: var(--accent-soft);
      color: var(--accent); display: grid; place-items: center; margin-bottom: 1rem; font-size: 1.25rem;
    }
    .feature h3 { font-size: 1.1rem; margin-bottom: .5rem; font-weight: 700; }
    .feature p { color: var(--muted); font-size: .95rem; }
    .cta-section {
      background: linear-gradient(135deg, var(--accent) 0%, #D9540A 100%);
      color: white; border-radius: 24px; padding: 3.5rem 2rem; text-align: center;
      margin: 2rem 0 4rem;
    }
    .cta-section h2 { font-size: clamp(1.6rem, 4vw, 2.4rem); margin-bottom: .75rem; font-weight: 700; }
    .cta-section p { opacity: 0.95; margin-bottom: 1.75rem; }
    .cta-section .btn { background: white; color: var(--accent); }
    .cta-section .btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
    footer { padding: 2rem 0; border-top: 1px solid var(--border); color: var(--muted); font-size: .9rem; text-align: center; }
    @media (max-width: 640px) { .nav-links { display: none; } }
  </style>
</head>
<body>
  <nav>
    <div class="container">
      <div class="logo">${name.split(/\s+/)[0] || name}<span>.</span></div>
      <ul class="nav-links">
        <li><a href="#features">Features</a></li>
        <li><a href="#cta">Get started</a></li>
      </ul>
      <a href="#cta" class="btn btn-primary">Get started →</a>
    </div>
  </nav>

  <header class="hero">
    <div class="container">
      <span class="badge">✨ Live and ready</span>
      <h1>Welcome to <em>${name}</em></h1>
      <p>A modern, fast website ready to grow with your ideas. Tell Agent-4 what to add — sections, designs, integrations — and watch it ship in seconds.</p>
      <div class="hero-cta">
        <a href="#features" class="btn btn-primary">Explore →</a>
        <a href="#cta" class="btn btn-ghost">Learn more</a>
      </div>
    </div>
  </header>

  <section id="features">
    <div class="container">
      <h2 class="section-title">Built for what's next</h2>
      <p class="section-sub">Every piece is editable. Just describe what you want.</p>
      <div class="features">
        <div class="feature">
          <div class="feature-icon">⚡</div>
          <h3>Lightning fast</h3>
          <p>Pure HTML, CSS and JS — zero bloat, instant loads on every device.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">🎨</div>
          <h3>Beautiful by default</h3>
          <p>Modern typography, thoughtful spacing, and a polished color system out of the box.</p>
        </div>
        <div class="feature">
          <div class="feature-icon">📱</div>
          <h3>Fully responsive</h3>
          <p>Looks great from a phone to a 4K monitor — no extra work needed.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="cta">
    <div class="container">
      <div class="cta-section">
        <h2>Ready to make it yours?</h2>
        <p>Ask Agent-4 to add sections, change the design, or integrate any service.</p>
        <a href="#" class="btn">Start building</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">© ${new Date().getFullYear()} ${name}. Built with NexusOps.</div>
  </footer>
</body>
</html>
`,
  "game": (name) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${name}</title>
  <style>
    *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: radial-gradient(ellipse at top, #1a1a2e 0%, #0a0a1a 100%);
      min-height: 100vh; display: grid; place-items: center;
      color: #fff; padding: 1rem; overflow: hidden;
    }
    .game-shell {
      background: rgba(255,255,255,0.04); backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.08); border-radius: 24px;
      padding: 1.5rem; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 1.5rem; margin-bottom: 1rem; text-align: center; font-weight: 700;
      background: linear-gradient(90deg, #F26207, #FFB47B);
      -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .hud {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 1rem; font-size: .95rem;
    }
    .hud-item { background: rgba(255,255,255,0.06); padding: .5rem 1rem; border-radius: 8px; }
    .hud-item strong { color: #F26207; margin-left: .35rem; }
    canvas { background: #0d0d1f; border-radius: 12px; display: block; max-width: 100%; height: auto; }
    .controls { margin-top: 1rem; text-align: center; color: rgba(255,255,255,0.55); font-size: .85rem; }
    .controls kbd {
      background: rgba(255,255,255,0.1); padding: .15rem .5rem; border-radius: 4px;
      font-family: monospace; font-size: .8rem; margin: 0 .15rem;
    }
    .overlay {
      position: absolute; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
      display: none; place-items: center; flex-direction: column; gap: 1rem;
      border-radius: 12px; padding: 2rem; text-align: center;
    }
    .overlay.show { display: grid; }
    .overlay h2 { font-size: 2rem; font-weight: 800; }
    .overlay button {
      background: #F26207; color: white; border: none; padding: .8rem 2rem;
      border-radius: 10px; font-weight: 600; font-size: 1rem; cursor: pointer;
      transition: all .2s;
    }
    .overlay button:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(242,98,7,0.4); }
    .canvas-wrap { position: relative; }
  </style>
</head>
<body>
  <div class="game-shell">
    <h1>🐍 ${name}</h1>
    <div class="hud">
      <div class="hud-item">Score:<strong id="score">0</strong></div>
      <div class="hud-item">High:<strong id="high">0</strong></div>
    </div>
    <div class="canvas-wrap">
      <canvas id="game" width="480" height="480"></canvas>
      <div class="overlay" id="overlay">
        <h2 id="overlayTitle">Game Over</h2>
        <p id="overlayMsg">Press space or tap to play again</p>
        <button onclick="startGame()">Play again</button>
      </div>
    </div>
    <div class="controls">
      Use <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> or swipe · <kbd>Space</kbd> to pause
    </div>
  </div>
  <script>
    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const SIZE = 24;
    const COLS = cv.width / SIZE;
    const ROWS = cv.height / SIZE;
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayMsg = document.getElementById('overlayMsg');

    let snake, dir, nextDir, food, score, speed, paused, alive, tickTimer;
    let high = +(localStorage.getItem('${name}_high') || 0);
    document.getElementById('high').textContent = high;

    function reset() {
      snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
      dir = { x: 1, y: 0 }; nextDir = dir;
      score = 0; speed = 130; paused = false; alive = true;
      placeFood();
      document.getElementById('score').textContent = 0;
      overlay.classList.remove('show');
    }
    function placeFood() {
      while (true) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        if (!snake.some(s => s.x === x && s.y === y)) { food = { x, y }; return; }
      }
    }
    function step() {
      if (paused || !alive) return;
      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return die();
      if (snake.some(s => s.x === head.x && s.y === head.y)) return die();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        document.getElementById('score').textContent = score;
        if (score > high) { high = score; localStorage.setItem('${name}_high', high); document.getElementById('high').textContent = high; }
        if (speed > 60) speed -= 2;
        placeFood();
      } else snake.pop();
      draw();
    }
    function draw() {
      ctx.fillStyle = '#0d0d1f'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#F26207';
      ctx.beginPath();
      ctx.arc(food.x * SIZE + SIZE/2, food.y * SIZE + SIZE/2, SIZE/2 - 3, 0, Math.PI * 2);
      ctx.fill();
      snake.forEach((s, i) => {
        ctx.fillStyle = i === 0 ? '#FFB47B' : 'rgba(242,98,7,' + (1 - i/snake.length * 0.7) + ')';
        roundRect(s.x * SIZE + 1, s.y * SIZE + 1, SIZE - 2, SIZE - 2, 5);
      });
    }
    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.arcTo(x+w, y, x+w, y+h, r);
      ctx.arcTo(x+w, y+h, x, y+h, r);
      ctx.arcTo(x, y+h, x, y, r);
      ctx.arcTo(x, y, x+w, y, r);
      ctx.closePath(); ctx.fill();
    }
    function die() {
      alive = false; clearInterval(tickTimer);
      overlayTitle.textContent = '💥 Game Over';
      overlayMsg.textContent = 'Score: ' + score + (score === high && score > 0 ? ' · New high!' : '');
      overlay.classList.add('show');
    }
    function startGame() {
      reset();
      clearInterval(tickTimer);
      tickTimer = setInterval(step, speed);
      const adjustSpeed = setInterval(() => {
        if (!alive) { clearInterval(adjustSpeed); return; }
        clearInterval(tickTimer);
        tickTimer = setInterval(step, speed);
      }, 1000);
    }

    document.addEventListener('keydown', e => {
      const k = e.key;
      if ((k === 'ArrowUp' || k === 'w') && dir.y !== 1) nextDir = { x: 0, y: -1 };
      else if ((k === 'ArrowDown' || k === 's') && dir.y !== -1) nextDir = { x: 0, y: 1 };
      else if ((k === 'ArrowLeft' || k === 'a') && dir.x !== 1) nextDir = { x: -1, y: 0 };
      else if ((k === 'ArrowRight' || k === 'd') && dir.x !== -1) nextDir = { x: 1, y: 0 };
      else if (k === ' ') { e.preventDefault(); if (!alive) startGame(); else paused = !paused; }
    });
    let touch;
    cv.addEventListener('touchstart', e => { touch = e.touches[0]; });
    cv.addEventListener('touchend', e => {
      if (!touch) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touch.clientX, dy = t.clientY - touch.clientY;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 30 && dir.x !== -1) nextDir = { x: 1, y: 0 };
        else if (dx < -30 && dir.x !== 1) nextDir = { x: -1, y: 0 };
      } else {
        if (dy > 30 && dir.y !== -1) nextDir = { x: 0, y: 1 };
        else if (dy < -30 && dir.y !== 1) nextDir = { x: 0, y: -1 };
      }
    });

    startGame();
  </script>
</body>
</html>
`,
  "web-app": (name) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${name}</title>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    .scrollbar-hide::-webkit-scrollbar { display: none; }
  </style>
</head>
<body class="bg-[#FAF7F2]">
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useMemo } = React;

    function App() {
      const [tasks, setTasks] = useState(() => {
        try { return JSON.parse(localStorage.getItem('${name}_tasks') || '[]'); } catch { return []; }
      });
      const [input, setInput] = useState('');
      const [filter, setFilter] = useState('all');

      useEffect(() => {
        localStorage.setItem('${name}_tasks', JSON.stringify(tasks));
      }, [tasks]);

      const filtered = useMemo(() => tasks.filter(t =>
        filter === 'all' ? true : filter === 'active' ? !t.done : t.done
      ), [tasks, filter]);
      const remaining = tasks.filter(t => !t.done).length;

      function addTask(e) {
        e.preventDefault();
        const text = input.trim();
        if (!text) return;
        setTasks([{ id: Date.now(), text, done: false }, ...tasks]);
        setInput('');
      }
      function toggle(id) { setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t)); }
      function remove(id) { setTasks(tasks.filter(t => t.id !== id)); }
      function clearDone() { setTasks(tasks.filter(t => !t.done)); }

      return (
        <div className="min-h-screen flex flex-col items-center px-4 py-12">
          <div className="w-full max-w-xl">
            <header className="mb-8 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FEF1E6] text-[#F26207] text-xs font-semibold mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F26207]"></span> Live
              </div>
              <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">${name}</h1>
              <p className="text-gray-500 mt-2">Your interactive React app — fully editable by Agent-4</p>
            </header>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <form onSubmit={addTask} className="p-5 border-b border-gray-100 flex gap-2">
                <input
                  value={input} onChange={e => setInput(e.target.value)}
                  placeholder="Add a task and press Enter..."
                  className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F26207] focus:border-transparent text-gray-800"
                />
                <button className="px-5 py-3 bg-[#F26207] text-white rounded-xl font-semibold hover:bg-[#D9540A] active:scale-95 transition-all">
                  Add
                </button>
              </form>

              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-500">{remaining} {remaining === 1 ? 'task' : 'tasks'} left</span>
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {['all', 'active', 'done'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={\`px-3 py-1 rounded-md text-xs font-semibold transition-colors capitalize \${filter === f ? 'bg-white text-[#F26207] shadow-sm' : 'text-gray-500 hover:text-gray-700'}\`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto scrollbar-hide">
                {filtered.length === 0 ? (
                  <li className="p-12 text-center text-gray-400 text-sm">
                    {tasks.length === 0 ? '🎉 No tasks yet. Add your first one above.' : 'Nothing here.'}
                  </li>
                ) : filtered.map(t => (
                  <li key={t.id} className="px-5 py-3 flex items-center gap-3 group hover:bg-gray-50 transition-colors">
                    <button onClick={() => toggle(t.id)}
                      className={\`w-5 h-5 rounded-md border-2 grid place-items-center transition-colors \${t.done ? 'bg-[#F26207] border-[#F26207]' : 'border-gray-300 hover:border-[#F26207]'}\`}>
                      {t.done && <svg viewBox="0 0 12 12" className="w-3 h-3 text-white"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <span className={\`flex-1 text-sm \${t.done ? 'line-through text-gray-400' : 'text-gray-800'}\`}>{t.text}</span>
                    <button onClick={() => remove(t.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all text-sm">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>

              {tasks.some(t => t.done) && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <button onClick={clearDone} className="text-xs text-gray-500 hover:text-[#F26207] font-medium transition-colors">
                    Clear completed
                  </button>
                </div>
              )}
            </div>

            <p className="text-center text-gray-400 text-xs mt-6">
              Tell Agent-4 what to build next — auth, charts, integrations, anything.
            </p>
          </div>
        </div>
      );
    }
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>
`,
  "python-script": (name) => `"""${name} — Python automation script.

A clean starter with logging, argparse, and clear structure.
Tell Agent-4 what to automate and watch it build.
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("${name}")


def run(args: argparse.Namespace) -> int:
    """Main entry — replace with your logic."""
    log.info("Starting ${name}")
    log.info("Arguments: %s", vars(args))

    # Example: process a file or fetch data
    if args.input:
        path = Path(args.input)
        if not path.exists():
            log.error("Input not found: %s", path)
            return 1
        log.info("Processing %s (%d bytes)", path.name, path.stat().st_size)

    log.info("Done ✓")
    return 0


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="${name}",
        description="${name} — built with NexusOps",
    )
    p.add_argument("-i", "--input", help="Optional input file path")
    p.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    try:
        return run(args)
    except KeyboardInterrupt:
        log.warning("Interrupted")
        return 130
    except Exception:
        log.exception("Unhandled error")
        return 1


if __name__ == "__main__":
    sys.exit(main())
`,
  "api-server-javascript": (name) => `// ${name} — Express REST API
// A production-ready starter with CORS, JSON parsing, validation,
// structured error handling and a sample resource.
//
// Tell Agent-4 to add endpoints, auth, a database — anything.

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Request logger
app.use((req, _res, next) => {
  console.log(\`\${new Date().toISOString()} \${req.method} \${req.url}\`);
  next();
});

// ── Health & root ─────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ name: "${name}", status: "ok", uptime: process.uptime() });
});
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// ── Sample resource (in-memory store) ─────────────────────────────
const items = [
  { id: 1, title: "Welcome to ${name}", done: false },
];
let nextId = 2;

app.get("/api/items", (_req, res) => res.json({ items }));

app.get("/api/items/:id", (req, res) => {
  const item = items.find((i) => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "not_found" });
  res.json(item);
});

app.post("/api/items", (req, res) => {
  const { title } = req.body || {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }
  const item = { id: nextId++, title: title.trim(), done: false };
  items.push(item);
  res.status(201).json(item);
});

app.patch("/api/items/:id", (req, res) => {
  const item = items.find((i) => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: "not_found" });
  if (typeof req.body?.title === "string") item.title = req.body.title;
  if (typeof req.body?.done === "boolean") item.done = req.body.done;
  res.json(item);
});

app.delete("/api/items/:id", (req, res) => {
  const idx = items.findIndex((i) => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "not_found" });
  items.splice(idx, 1);
  res.status(204).end();
});

// ── 404 + error handlers ──────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: "route_not_found" }));
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(\`✅ ${name} API listening on http://0.0.0.0:\${PORT}\`);
});
`,
  "api-server-python": (name) => `"""${name} — FastAPI REST API.

Production-ready starter with CORS, Pydantic models, error handling
and a sample resource. Tell Agent-4 to add endpoints, auth, a database.
"""
from __future__ import annotations

import os
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="${name}",
    description="${name} — built with NexusOps",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ItemIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    done: bool = False


class Item(ItemIn):
    id: int


class ItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    done: Optional[bool] = None


_items: List[Item] = [Item(id=1, title="Welcome to ${name}", done=False)]
_next_id = 2


@app.get("/")
def root():
    return {"name": "${name}", "status": "ok"}


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/items", response_model=List[Item])
def list_items():
    return _items


@app.get("/api/items/{item_id}", response_model=Item)
def get_item(item_id: int):
    for it in _items:
        if it.id == item_id:
            return it
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


@app.post("/api/items", response_model=Item, status_code=status.HTTP_201_CREATED)
def create_item(payload: ItemIn):
    global _next_id
    item = Item(id=_next_id, **payload.model_dump())
    _next_id += 1
    _items.append(item)
    return item


@app.patch("/api/items/{item_id}", response_model=Item)
def update_item(item_id: int, payload: ItemUpdate):
    for i, it in enumerate(_items):
        if it.id == item_id:
            data = it.model_dump()
            update = payload.model_dump(exclude_unset=True)
            data.update(update)
            _items[i] = Item(**data)
            return _items[i]
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


@app.delete("/api/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int):
    for i, it in enumerate(_items):
        if it.id == item_id:
            _items.pop(i)
            return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    uvicorn.run(app, host="0.0.0.0", port=port)
`,
  "discord-bot-javascript": (name) => `// ${name} — Discord bot (discord.js v14)
// Production-ready starter: slash commands, embeds, error handling, graceful shutdown.
// Add the BOT_TOKEN secret in your project, then ask Agent-4 to add new commands.

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
} = require("discord.js");

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("❌ Missing BOT_TOKEN environment variable");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── Slash commands ────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Replies with latency"),
  new SlashCommandBuilder().setName("hello").setDescription("Friendly greeting"),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Information about this bot"),
].map((c) => c.toJSON());

// ── Event handlers ────────────────────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(\`✅ \${c.user.tag} is online — serving \${c.guilds.cache.size} guild(s)\`);
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    console.log(\`📜 Registered \${commands.length} slash commands\`);
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === "ping") {
      await interaction.reply({
        content: \`🏓 Pong! \${client.ws.ping}ms\`,
        ephemeral: true,
      });
    } else if (interaction.commandName === "hello") {
      await interaction.reply(\`👋 Hello \${interaction.user.username}!\`);
    } else if (interaction.commandName === "info") {
      const embed = new EmbedBuilder()
        .setTitle("${name}")
        .setDescription("Built with NexusOps · powered by Agent-4")
        .setColor(0xf26207)
        .addFields(
          { name: "Servers", value: \`\${client.guilds.cache.size}\`, inline: true },
          { name: "Latency", value: \`\${client.ws.ping}ms\`, inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Command error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true }).catch(() => {});
    }
  }
});

client.on(Events.Error, (err) => console.error("Client error:", err));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("SIGTERM", () => { console.log("Shutting down..."); client.destroy(); process.exit(0); });

client.login(TOKEN);
`,
  "discord-bot-python": (name) => `"""${name} — Discord bot (discord.py).

Production-ready starter with slash commands, embeds, error handling.
Set the BOT_TOKEN secret, then ask Agent-4 to add new commands or features.
"""
from __future__ import annotations

import logging
import os
import sys

import discord
from discord import app_commands
from discord.ext import commands

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("${name}")

TOKEN = os.environ.get("BOT_TOKEN")
if not TOKEN:
    log.error("Missing BOT_TOKEN environment variable")
    sys.exit(1)

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    log.info("✅ %s is online — serving %d guild(s)", bot.user, len(bot.guilds))
    try:
        synced = await bot.tree.sync()
        log.info("📜 Synced %d slash command(s)", len(synced))
    except Exception:
        log.exception("Failed to sync commands")


@bot.tree.command(name="ping", description="Replies with latency")
async def ping(interaction: discord.Interaction):
    latency = round(bot.latency * 1000)
    await interaction.response.send_message(f"🏓 Pong! {latency}ms", ephemeral=True)


@bot.tree.command(name="hello", description="Friendly greeting")
async def hello(interaction: discord.Interaction):
    await interaction.response.send_message(f"👋 Hello {interaction.user.mention}!")


@bot.tree.command(name="info", description="Information about this bot")
async def info(interaction: discord.Interaction):
    embed = discord.Embed(
        title="${name}",
        description="Built with NexusOps · powered by Agent-4",
        color=0xF26207,
    )
    embed.add_field(name="Servers", value=str(len(bot.guilds)), inline=True)
    embed.add_field(name="Latency", value=f"{round(bot.latency * 1000)}ms", inline=True)
    await interaction.response.send_message(embed=embed)


@bot.event
async def on_command_error(_ctx, error):
    log.error("Command error: %s", error)


if __name__ == "__main__":
    bot.run(TOKEN, log_handler=None)
`,
};

// Public-facing templates apply safeName before interpolation, neutralizing
// HTML/JS/Python injection from a user-supplied project name.
const STARTER_TEMPLATES: Record<string, (name: string) => string> = Object.fromEntries(
  Object.entries(STARTER_TEMPLATES_RAW).map(([k, fn]) => [k, (name: string) => fn(safeName(name))]),
);

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

/* ── File-tree explorer endpoints (read-only, scoped to bot dir) ────────── */

const FILE_TREE_IGNORE = new Set([
  "node_modules", ".venv", "venv", "__pycache__", ".git", "dist", "build", ".next", ".cache",
]);
const FILE_TREE_MAX_ENTRIES = 800;
const FILE_TREE_MAX_DEPTH = 8;
const FILE_CONTENT_MAX_BYTES = 512 * 1024; // 512KB
const TEXT_EXTS = new Set([
  ".html", ".htm", ".css", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx",
  ".json", ".md", ".txt", ".py", ".yml", ".yaml", ".toml", ".xml", ".svg",
  ".env", ".sh", ".gitignore", ".csv", ".sql", ".vue", ".astro",
]);

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children?: TreeNode[];
}

function buildTree(absDir: string, root: string, depth: number, counter: { n: number }): TreeNode[] {
  if (depth > FILE_TREE_MAX_DEPTH) return [];
  let names: string[];
  try { names = readdirSync(absDir); } catch { return []; }
  const out: TreeNode[] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    if (counter.n >= FILE_TREE_MAX_ENTRIES) break;
    if (FILE_TREE_IGNORE.has(name) || name.startsWith(".replit") || name === ".pythonlibs") continue;
    const full = join(absDir, name);
    // Detect symlinks WITHOUT following them — prevents loops
    let ls; try { ls = lstatSync(full); } catch { continue; }
    if (ls.isSymbolicLink()) continue;
    let s; try { s = statSync(full); } catch { continue; }
    counter.n++;
    const rel = relative(root, full).split(sep).join("/");
    if (s.isDirectory()) {
      out.push({
        name,
        path: rel,
        type: "dir",
        children: buildTree(full, root, depth + 1, counter),
      });
    } else {
      out.push({ name, path: rel, type: "file", size: s.size });
    }
  }
  out.sort((a, b) => (a.type === b.type ? 0 : a.type === "dir" ? -1 : 1));
  return out;
}

router.get("/bots/:id/files/tree", (req, res): void => {
  const id = req.params["id"];
  if (typeof id !== "string" || !id) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  const root = resolve(getBotDir(id));
  if (!existsSync(root)) { res.json({ id, root: "", tree: [] }); return; }
  const counter = { n: 0 };
  const tree = buildTree(root, root, 0, counter);
  res.json({ id, count: counter.n, tree });
});

router.put("/bots/:id/files/content", (req, res): void => {
  const id = req.params["id"];
  if (typeof id !== "string" || !id) { res.status(400).json({ error: "id is required" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  const body = req.body as { path?: unknown; content?: unknown } | undefined;
  const rawPath = body?.path;
  const content = body?.content;
  if (typeof rawPath !== "string" || !rawPath.trim()) { res.status(400).json({ error: "path is required" }); return; }
  if (typeof content !== "string") { res.status(400).json({ error: "content must be string" }); return; }
  if (Buffer.byteLength(content, "utf-8") > FILE_CONTENT_MAX_BYTES) {
    res.status(413).json({ error: `content too large (max ${FILE_CONTENT_MAX_BYTES} bytes)` });
    return;
  }
  const root = resolve(getBotDir(id));
  const rootSep = root.endsWith(sep) ? root : root + sep;
  const trimmed = rawPath.trim().replace(/^\/+/, "");
  if (trimmed.includes("\0") || trimmed.includes("..")) { res.status(400).json({ error: "invalid path" }); return; }
  const abs = resolve(join(root, trimmed));
  if (abs !== root && !abs.startsWith(rootSep)) { res.status(400).json({ error: "path escapes project" }); return; }
  if (!existsSync(abs)) { res.status(404).json({ error: "file not found (cannot create new files via this endpoint)" }); return; }
  const ls = lstatSync(abs);
  if (ls.isSymbolicLink()) { res.status(400).json({ error: "symlinks are not editable" }); return; }
  const s = statSync(abs);
  if (s.isDirectory()) { res.status(400).json({ error: "path is a directory" }); return; }
  try {
    writeFileSync(abs, content, "utf-8");
    const newSize = Buffer.byteLength(content, "utf-8");
    res.json({ id, path: trimmed, size: newSize, saved: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

const SEARCH_MAX_FILES = 2000;
const SEARCH_MAX_FILE_BYTES = 256 * 1024;
const SEARCH_MAX_RESULTS = 200;
const SEARCH_SKIP_DIRS = new Set(["node_modules", ".git", "site-packages", "__pycache__", ".venv", "venv", "dist", "build", ".next", ".cache"]);

interface SearchHit {
  path: string;
  line: number;
  snippet: string;
  matchStart: number;
  matchEnd: number;
}

async function searchInDir(
  root: string,
  dir: string,
  needle: string,
  hits: SearchHit[],
  caseSensitive: boolean,
  counters: { files: number },
): Promise<void> {
  if (hits.length >= SEARCH_MAX_RESULTS) return;
  if (counters.files >= SEARCH_MAX_FILES) return;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (hits.length >= SEARCH_MAX_RESULTS) return;
    if (counters.files >= SEARCH_MAX_FILES) return;
    if (SEARCH_SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    // Reject symlinks to prevent traversal outside the project root
    let lsEntry;
    try { lsEntry = lstatSync(abs); } catch { continue; }
    if (lsEntry.isSymbolicLink()) continue;
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) {
      await searchInDir(root, abs, needle, hits, caseSensitive, counters);
    } else if (st.isFile()) {
      if (st.size > SEARCH_MAX_FILE_BYTES) continue;
      const ext = extname(abs).toLowerCase();
      if (!TEXT_EXTS.has(ext) && st.size > 64 * 1024) continue;
      counters.files++;
      // Yield to event loop every 25 files to avoid blocking other requests
      if (counters.files % 25 === 0) {
        await new Promise<void>((resolve) => { setImmediate(resolve); });
      }
      let txt: string;
      try { txt = readFileSync(abs, "utf-8"); } catch { continue; }
      const haystack = caseSensitive ? txt : txt.toLowerCase();
      const target = caseSensitive ? needle : needle.toLowerCase();
      let off = 0;
      while (off < haystack.length) {
        const idx = haystack.indexOf(target, off);
        if (idx === -1) break;
        // find line number + boundaries
        let lineStart = idx;
        while (lineStart > 0 && txt[lineStart - 1] !== "\n") lineStart--;
        let lineEnd = idx + target.length;
        while (lineEnd < txt.length && txt[lineEnd] !== "\n") lineEnd++;
        const line = txt.slice(0, idx).split("\n").length;
        const snippet = txt.slice(lineStart, lineEnd).slice(0, 240);
        hits.push({
          path: relative(root, abs).replace(/\\/g, "/"),
          line,
          snippet,
          matchStart: idx - lineStart,
          matchEnd: idx - lineStart + target.length,
        });
        if (hits.length >= SEARCH_MAX_RESULTS) return;
        off = idx + target.length;
      }
    }
  }
}

router.get("/bots/:id/search", async (req, res): Promise<void> => {
  const id = req.params["id"];
  if (typeof id !== "string" || !id) { res.status(400).json({ error: "id is required" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  const q = req.query["q"];
  if (typeof q !== "string" || q.length < 2) { res.status(400).json({ error: "q must be at least 2 chars" }); return; }
  if (q.length > 200) { res.status(400).json({ error: "q too long" }); return; }
  const caseSensitive = req.query["cs"] === "1" || req.query["cs"] === "true";
  const root = resolve(getBotDir(id));
  if (!existsSync(root)) { res.json({ id, query: q, count: 0, hits: [] }); return; }
  const hits: SearchHit[] = [];
  const counters = { files: 0 };
  await searchInDir(root, root, q, hits, caseSensitive, counters);
  res.json({
    id,
    query: q,
    count: hits.length,
    truncated: hits.length >= SEARCH_MAX_RESULTS,
    filesScanned: counters.files,
    hits,
  });
});

router.get("/bots/:id/files/content", (req, res): void => {
  const id = req.params["id"];
  const rawPath = req.query["path"];
  if (typeof id !== "string" || !id) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    res.status(400).json({ error: "path is required" });
    return;
  }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }

  const root = resolve(getBotDir(id));
  const rootSep = root.endsWith(sep) ? root : root + sep;
  const trimmed = rawPath.trim().replace(/^\/+/, "");
  if (trimmed.includes("\0")) { res.status(400).json({ error: "invalid path" }); return; }
  const abs = resolve(join(root, trimmed));
  if (abs !== root && !abs.startsWith(rootSep)) {
    res.status(400).json({ error: "path escapes project" });
    return;
  }
  if (!existsSync(abs)) { res.status(404).json({ error: "file not found" }); return; }
  const ls2 = lstatSync(abs);
  if (ls2.isSymbolicLink()) { res.status(400).json({ error: "symlinks are not readable" }); return; }
  const s = statSync(abs);
  if (s.isDirectory()) { res.status(400).json({ error: "path is a directory" }); return; }
  if (s.size > FILE_CONTENT_MAX_BYTES) {
    res.status(413).json({ error: `file too large (${s.size} bytes, max ${FILE_CONTENT_MAX_BYTES})`, size: s.size });
    return;
  }
  const ext = extname(abs).toLowerCase();
  const isText = TEXT_EXTS.has(ext) || s.size < 64 * 1024;
  if (!isText) { res.status(415).json({ error: "binary file (preview not supported)", size: s.size, ext }); return; }
  try {
    const content = readFileSync(abs, "utf-8");
    res.json({ id, path: trimmed, size: s.size, ext, content });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ── Secrets (encrypted env vars) ─────────────────────────────────────────── */

// Strict ownership: bot.userId must equal request userId. Anonymous bots
// (no userId) are only manageable in fully-anonymous mode (no auth at all).
function isAuthorized(bot: { userId?: string }, userId: string | undefined): boolean {
  return (bot.userId ?? null) === (userId ?? null);
}

router.get("/bots/:id/secrets", (req, res): void => {
  const id = req.params["id"];
  if (typeof id !== "string" || !id) { res.status(400).json({ error: "id required" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ id, secrets: listSecretsMasked(id) });
});

router.post("/bots/:id/secrets", (req, res): void => {
  const id = req.params["id"];
  if (typeof id !== "string" || !id) { res.status(400).json({ error: "id required" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  const body = req.body as { key?: unknown; value?: unknown } | undefined;
  const key = body?.key;
  const value = body?.value;
  if (!isValidSecretKey(key)) { res.status(400).json({ error: "Invalid key — uppercase letters/digits/_, must start with letter or _" }); return; }
  if (typeof value !== "string") { res.status(400).json({ error: "value must be string" }); return; }
  try {
    setSecret(id, key, value);
    let restartError: string | null = null;
    if (bot.status === "running") {
      try { restartBot(id); } catch (e) { restartError = (e as Error).message; }
    }
    res.json({ id, key, restarted: bot.status === "running" && !restartError, ...(restartError ? { restartError } : {}) });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete("/bots/:id/secrets/:key", (req, res): void => {
  const id = req.params["id"];
  const key = req.params["key"];
  if (typeof id !== "string" || !id || typeof key !== "string" || !key) { res.status(400).json({ error: "id and key required" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!isValidSecretKey(key)) { res.status(400).json({ error: "Invalid key" }); return; }
  const removed = deleteSecret(id, key);
  if (!removed) { res.status(404).json({ error: "Secret not found" }); return; }
  let restartError: string | null = null;
  if (bot.status === "running") {
    try { restartBot(id); } catch (e) { restartError = (e as Error).message; }
  }
  res.json({ id, key, removed: true, ...(restartError ? { restartError } : {}) });
});

/* ── Checkpoints (git versioning + rollback) ──────────────────────────────── */

router.get("/bots/:id/checkpoints", async (req, res): Promise<void> => {
  const id = req.params["id"];
  if (typeof id !== "string" || !id) { res.status(400).json({ error: "id required" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const checkpoints = await listCheckpoints(getBotDir(id));
    res.json({ id, count: checkpoints.length, checkpoints });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/bots/:id/checkpoints", async (req, res): Promise<void> => {
  const id = req.params["id"];
  if (typeof id !== "string" || !id) { res.status(400).json({ error: "id required" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  const body = req.body as { message?: unknown } | undefined;
  const message = typeof body?.message === "string" && body.message.trim()
    ? body.message
    : "Manual snapshot";
  try {
    const sha = await snapshotCheckpoint(getBotDir(id), message, { isAutomatic: false, skipIfClean: false });
    res.json({ id, sha, message });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/bots/:id/checkpoints/:sha/restore", async (req, res): Promise<void> => {
  const id = req.params["id"];
  const sha = req.params["sha"];
  if (typeof id !== "string" || !id) { res.status(400).json({ error: "id required" }); return; }
  if (!isValidSha(sha)) { res.status(400).json({ error: "Invalid sha" }); return; }
  const bot = getBot(id);
  if (!bot) { res.status(404).json({ error: "Bot not found" }); return; }
  if (!isAuthorized(bot, getUserId(req))) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const result = await restoreCheckpoint(getBotDir(id), sha);
    if (bot.status === "running") {
      try { restartBot(id); } catch { /* non-fatal */ }
    }
    res.json({ id, ...result, restarted: bot.status === "running" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
