import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botsRouter from "./bots";
import botsImportExportRouter from "./bots-import-export";
import anthropicRouter from "./anthropic/index.js";
import agentRouter from "./agent/index.js";
import botsEditorRouter from "./bots-editor.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botsRouter);
router.use(botsImportExportRouter);
router.use(anthropicRouter);
router.use(agentRouter);
router.use(botsEditorRouter);

export default router;
