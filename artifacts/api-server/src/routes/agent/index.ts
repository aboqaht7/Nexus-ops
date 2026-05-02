import { Router } from "express";
import { AgentDeployBotBody } from "@workspace/api-zod";
import { registerBot } from "../../lib/bot-manager.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const router = Router();

router.post("/agent/deploy", async (req, res) => {
  const body = AgentDeployBotBody.parse(req.body);

  const ext = body.language === "javascript" ? "js" : "py";
  const safeName = body.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const filename = `${safeName}-${Date.now()}.${ext}`;

  const botFilesDir = join(process.cwd(), "data", "bot-files");
  if (!existsSync(botFilesDir)) {
    mkdirSync(botFilesDir, { recursive: true });
  }

  const filePath = join(botFilesDir, filename);
  writeFileSync(filePath, body.code, "utf-8");

  const bot = registerBot(body.name, filename, body.code, body.language);

  res.status(201).json(bot);
});

export default router;
