import { Router } from "express";
import { bot } from "../bot";

const router = Router();

router.post("/bot/webhook", (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

export default router;

