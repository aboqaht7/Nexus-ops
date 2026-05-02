import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  CreateAnthropicConversationBody,
  SendAnthropicMessageBody,
} from "@workspace/api-zod";
import { AGENT_TOOLS, executeTool, buildBotContext, type ToolName } from "./tools.js";
import type Anthropic from "@anthropic-ai/sdk";

const router = Router();

/* ── System prompt ──────────────────────────────────────────────────────── */

const BASE_SYSTEM_PROMPT = `You are Agent-4, an elite autonomous full-stack engineer AI inside NexusOps — a comprehensive build-anything platform similar to Replit. You can build Discord bots, websites, games, web apps, API servers, and Python scripts.

## Your real tools:
- **read_bot_file** — Read the project's main source file (always start here)
- **write_bot_file** — Write/overwrite the main source file
- **install_packages** — Install npm/pip packages into the project's ISOLATED environment
- **run_command** — Run any shell command inside the project's directory (create files, list, debug)
- **get_bot_logs** — Read live stdout/stderr from the running process
- **restart_bot** — Restart to apply code + package changes
- **start_bot / stop_bot** — Start or stop the project process

## Your autonomous workflow:
1. **read_bot_file** — understand current state
2. **write_bot_file** — write the complete new/updated code
3. **install_packages** — install required libraries
4. **restart_bot** — apply all changes
5. **get_bot_logs** — confirm it started, check for errors
6. **If errors** — read logs, diagnose, fix code, restart, check again. Iterate until working.

## Rules:
- You are AUTONOMOUS. Do not ask the user to do things you can do yourself.
- Each project runs in its own isolated directory with its own node_modules / site-packages
- For multi-file projects (HTML+CSS+JS, multi-route APIs), use \`run_command\` with \`cat > filename << 'EOF' ... EOF\` to create extra files
- After install_packages + restart_bot, check get_bot_logs to confirm no errors
- Write clean, production-ready, well-commented code
- Detect the user's language from their messages and respond in that language. Code and tool inputs always in English.`;

const PROJECT_TYPE_PROMPTS: Record<string, string> = {
  "discord-bot": `

## PROJECT TYPE: Discord Bot
- ALWAYS use env vars: \`process.env.BOT_TOKEN\` (JS) or \`os.environ.get('BOT_TOKEN')\` (Python)
- JS: use discord.js v14 with GatewayIntentBits, SlashCommandBuilder, REST, Routes
- Python: use discord.py (\`import discord\`) or nextcord
- Register slash commands on \`ready\` event
- Build clean command handlers with proper error handling`,

  "website": `

## PROJECT TYPE: Static Website
- Build with vanilla HTML, CSS, and JavaScript — no frameworks
- The main file is \`index.html\` — write the full page there
- Use \`<style>\` and \`<script>\` inline OR create separate .css/.js files via \`run_command\`
- Make it RESPONSIVE (mobile + desktop) and visually polished
- Modern design: clean typography, smooth transitions, proper spacing
- The project is automatically served — no need to start a server
- After write_bot_file the user can preview live in iframe — no need to call start_bot`,

  "game": `

## PROJECT TYPE: HTML5 Game
- Build with HTML5 Canvas + vanilla JavaScript
- The main file is \`index.html\` containing the full game
- Implement: game loop (\`requestAnimationFrame\`), input handling, collision detection, scoring
- Make it FUN and POLISHED: smooth controls, sound effects optional, clear UI
- Add a start screen and game-over screen
- The game runs in an iframe preview — no server needed
- After write_bot_file the user can play immediately`,

  "web-app": `

## PROJECT TYPE: Web Application
- Build a single-page React app using CDN-based React (no build step)
- The main file is \`index.html\` with React + ReactDOM via \`<script src="https://unpkg.com/react@18/umd/react.production.min.js">\` etc.
- Use Babel standalone for JSX in browser, or write plain React.createElement
- Include state management, API calls (fetch), and a polished UI
- Make it look professional — Tailwind via CDN is allowed
- The app runs in an iframe preview — no server needed`,

  "api-server": `

## PROJECT TYPE: API Server
- JS: use Express on \`process.env.PORT || 3000\`, with proper middleware (cors, json)
- Python: use FastAPI with uvicorn, listening on \`0.0.0.0\` port from env
- Implement REST endpoints with proper status codes and JSON responses
- Add input validation, error handling, and structured responses
- Use \`install_packages\` for express, cors, fastapi, uvicorn, etc.
- After restart, test endpoints by reading logs`,

  "python-script": `

## PROJECT TYPE: Python Script
- Build a standalone script — automation, scraping, data processing, etc.
- The main file is \`main.py\` (or as configured)
- Use proper error handling with try/except
- Print clear progress to stdout (visible in logs)
- Use \`install_packages\` for libraries like requests, beautifulsoup4, pandas, etc.
- For long-running scripts, log progress periodically`,
};

function buildSystemPrompt(projectType: string | undefined): string {
  const type = projectType ?? "discord-bot";
  const typeSpecific = PROJECT_TYPE_PROMPTS[type] ?? PROJECT_TYPE_PROMPTS["discord-bot"];
  return BASE_SYSTEM_PROMPT + typeSpecific;
}


/* ── Conversation CRUD ─────────────────────────────────────────────────── */

router.get("/anthropic/conversations", async (_req, res) => {
  const rows = await db.select().from(conversations).orderBy(asc(conversations.createdAt));
  res.json(rows);
});

router.post("/anthropic/conversations", async (req, res) => {
  const body = CreateAnthropicConversationBody.parse(req.body);
  const [row] = await db
    .insert(conversations)
    .values({ title: body.title, botId: body.botId ?? null })
    .returning();
  res.status(201).json(row);
});

router.get("/anthropic/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  const msgs = await db
    .select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));

  res.json({ ...conv, messages: msgs });
});

router.delete("/anthropic/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const deleted = await db.delete(conversations).where(eq(conversations.id, id)).returning();
  if (!deleted.length) { res.status(404).json({ error: "Conversation not found" }); return; }

  res.status(204).end();
});

router.get("/anthropic/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const msgs = await db
    .select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));

  res.json(msgs);
});

/* ── SSE helper ─────────────────────────────────────────────────────────── */

function sseWrite(res: import("express").Response, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/* ── Agentic message endpoint ────────────────────────────────────────────── */

router.post("/anthropic/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = SendAnthropicMessageBody.parse(req.body);

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }

  // Save user message
  await db.insert(messages).values({ conversationId: id, role: "user", content: body.content });

  // Build message history
  const history = await db
    .select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt));

  // Start SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const botId = conv.botId ?? "";
  const botContext = buildBotContext(botId || null);
  const { getBot } = await import("../../lib/bot-manager.js");
  const bot = botId ? getBot(botId) : undefined;
  const systemPrompt = buildSystemPrompt(bot?.projectType) + botContext;

  const chatMessages: Anthropic.MessageParam[] = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let fullAssistantText = "";
  const toolSummaries: string[] = [];

  try {
    // Agentic loop — up to 10 iterations
    for (let iteration = 0; iteration < 10; iteration++) {
      let currentText = "";
      const toolUseBlocks: Array<Anthropic.ToolUseBlock & { _inputStr?: string }> = [];

      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        tools: AGENT_TOOLS as unknown as Anthropic.Tool[],
        messages: chatMessages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          sseWrite(res, { type: "tool_start", id: event.content_block.id, name: event.content_block.name });
          toolUseBlocks.push({ ...event.content_block, _inputStr: "", input: {} });
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            currentText += event.delta.text;
            fullAssistantText += event.delta.text;
            sseWrite(res, { type: "text", content: event.delta.text });
          } else if (event.delta.type === "input_json_delta") {
            const block = toolUseBlocks[toolUseBlocks.length - 1];
            if (block) block._inputStr = (block._inputStr ?? "") + event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop") {
          const block = toolUseBlocks[toolUseBlocks.length - 1];
          if (block?._inputStr) {
            try { block.input = JSON.parse(block._inputStr); } catch { block.input = {}; }
          }
        }
      }

      const finalMsg = await stream.finalMessage();

      if (finalMsg.stop_reason !== "tool_use" || toolUseBlocks.length === 0) break;

      // Add assistant turn with tool_use blocks
      const assistantContent: Anthropic.ContentBlock[] = [];
      if (currentText) assistantContent.push({ type: "text", text: currentText });
      for (const block of toolUseBlocks) {
        const { _inputStr: _s, ...clean } = block;
        assistantContent.push(clean as Anthropic.ToolUseBlock);
      }
      chatMessages.push({ role: "assistant", content: assistantContent });

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const toolName = block.name as ToolName;
        const input = block.input as Record<string, unknown>;

        sseWrite(res, { type: "tool_running", id: block.id, name: toolName, input });

        let output: string;
        try {
          output = await executeTool(toolName, input, botId);
        } catch (err) {
          output = `Error: ${(err as Error).message}`;
        }

        sseWrite(res, { type: "tool_result", id: block.id, name: toolName, output });
        toolSummaries.push(`[${toolName}]: ${output.slice(0, 300)}`);

        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: output });
      }

      chatMessages.push({ role: "user", content: toolResults });
    }

    // Persist final assistant message
    const savedContent = fullAssistantText.trim()
      || (toolSummaries.length > 0 ? `نفّذت ${toolSummaries.length} عملية تلقائياً:\n${toolSummaries.join("\n")}` : "(no response)");

    await db.insert(messages).values({ conversationId: id, role: "assistant", content: savedContent });

    sseWrite(res, { type: "done" });
    res.end();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "AI error";
    sseWrite(res, { type: "error", error: errMsg });
    res.end();
  }
});

export default router;
