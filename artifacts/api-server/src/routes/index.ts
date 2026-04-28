import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botsRouter from "./bots";
import botsImportExportRouter from "./bots-import-export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botsRouter);
router.use(botsImportExportRouter);

export default router;
