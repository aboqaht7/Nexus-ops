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

const SYSTEM_PROMPT = `You are Agent-4, an elite Discord bot developer AI embedded in NexusOps — a professional Discord bot hosting platform.

You have REAL tools to take direct action:
- read_bot_file: Read the bot's current source code
- write_bot_file: Write/update the bot's source code instantly  
- run_command: Execute shell commands (pip install, npm install, diagnostics)
- get_bot_logs: Read live logs from the running bot
- restart_bot / start_bot / stop_bot: Control the bot runtime

Your workflow for ANY code task:
1. ALWAYS read_bot_file first to understand the current code
2. Write improved code with write_bot_file
3. Install missing packages with run_command if needed
4. Restart with restart_bot to apply changes
5. Use get_bot_logs to verify it started correctly
6. If there are errors in logs, diagnose and fix them — iterate until it works

You are a fully autonomous agent that ACTS, not just suggests. Write code directly to the file and make it work.

Critical rules:
- ALWAYS use environment variables: process.env.BOT_TOKEN (JS) or os.environ.get('BOT_TOKEN') (Python)
- Use discord.js v14 for JavaScript (GatewayIntentBits, SlashCommandBuilder, REST)
- Use discord.py or nextcord for Python
- Write clean, well-commented, production-ready code
- After every change, verify it works by checking logs
- If something fails, diagnose from logs and fix it autonomously

Always respond in Arabic to the user, but code and tool inputs in English.`;

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
  const systemPrompt = SYSTEM_PROMPT + botContext;

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
