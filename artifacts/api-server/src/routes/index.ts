import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botsRouter from "./bots";
import botsImportExportRouter from "./bots-import-export";
import anthropicRouter from "./anthropic/index.js";
import agentRouter from "./agent/index.js";
import botsEditorRouter from "./bots-editor.js";
import packagesRouter from "./packages.js";
import subscriptionsRouter from "./subscriptions.js";
import previewRouter from "./preview.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botsRouter);
router.use(botsImportExportRouter);
router.use(anthropicRouter);
router.use(agentRouter);
router.use(botsEditorRouter);
router.use(packagesRouter);
router.use(subscriptionsRouter);
router.use(previewRouter);

export default router;
