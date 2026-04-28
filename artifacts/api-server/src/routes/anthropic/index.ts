import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  CreateAnthropicConversationBody,
  SendAnthropicMessageBody,
} from "@workspace/api-zod";
import { getBot, getBotFilesDir } from "../../lib/bot-manager.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const router = Router();

const SYSTEM_PROMPT = `You are Agent-4, an expert Discord bot developer and coding assistant embedded in NexusOps — a Discord bot hosting control panel.

Your capabilities:
- Write complete, production-ready Discord bots in JavaScript (discord.js v14) and Python (discord.py / nextcord)
- Debug and fix errors in existing bot code
- Add new commands, features, events, and integrations to existing bots
- Explain code clearly and suggest improvements
- Help with deployment configuration

Important rules:
1. ALWAYS use environment variables for sensitive values: \`process.env.BOT_TOKEN\` (JS) or \`os.environ.get('BOT_TOKEN')\` (Python)
2. When writing complete bot files, wrap code in a fenced code block: \`\`\`javascript or \`\`\`python
3. For discord.js bots, always use v14 syntax with GatewayIntentBits and SlashCommandBuilder
4. For Python bots, use discord.py (import discord, from discord.ext import commands)
5. After writing code, mention that the user can click "Deploy Bot" to run it immediately
6. Keep code clean, well-commented, and production-ready

When the user asks you to:
- CREATE a bot: Write a complete, working bot file with proper imports, client setup, and at least basic commands
- FIX a bot: Identify the specific issue and provide the corrected code
- ADD a feature: Show only the new code to add and where to insert it, or provide the full updated file
- EXPLAIN something: Be clear and concise, use code examples when helpful`;

function buildBotContextPrompt(botId: string): string {
  const bot = getBot(botId);
  if (!bot) return "";

  const botFilesDir = getBotFilesDir();
  const filePath = join(botFilesDir, bot.filename);

  let fileContent = "";
  if (existsSync(filePath)) {
    try {
      fileContent = readFileSync(filePath, "utf-8");
    } catch {
      fileContent = "(could not read file)";
    }
  }

  return `\n\n---\nYou are currently working on the bot named "${bot.name}" (${bot.language}, file: ${bot.filename}, status: ${bot.status}).
${fileContent ? `\nCurrent bot code:\n\`\`\`${bot.language === "javascript" ? "javascript" : "python"}\n${fileContent}\n\`\`\`` : ""}
---`;
}

router.get("/anthropic/conversations", async (_req, res) => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(asc(conversations.createdAt));
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
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  res.json({ ...conv, messages: msgs });
});

router.delete("/anthropic/conversations/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const deleted = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning();

  if (!deleted.length) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  res.status(204).end();
});

router.get("/anthropic/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  res.json(msgs);
});

router.post("/anthropic/conversations/:id/messages", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = SendAnthropicMessageBody.parse(req.body);

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.insert(messages).values({
    conversationId: id,
    role: "user",
    content: body.content,
  });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  const chatMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const botContext = conv.botId ? buildBotContextPrompt(conv.botId) : "";
  const systemPrompt = SYSTEM_PROMPT + botContext;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "AI error";
    res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
    res.end();
  }
});

export default router;
