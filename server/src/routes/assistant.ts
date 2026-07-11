import { Router } from "express";
import { Role } from "../enums";
import { requireUser } from "../middleware";
import { askAssistant } from "../lib/assistant";

// Dashboard AI assistant — Ops Admin / Senior Manager / Capability Manager only. All data access is
// role-scoped inside askAssistant (a CM only ever sees their reportees). Read-only.
const router = Router();
router.use(requireUser([Role.OPS_ADMIN, Role.SENIOR_MANAGER, Role.CAPABILITY_MANAGER]));

router.post("/chat", async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const cleaned = messages
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: m.content }));
  if (!cleaned.length || cleaned[cleaned.length - 1].role !== "user") return res.status(400).json({ error: "Ask a question." });
  if (cleaned[cleaned.length - 1].content.trim().length > 1000) return res.status(400).json({ error: "That question is too long — please shorten it." });

  const out = await askAssistant(req.user!, cleaned);
  if (!out.ok) return res.status(503).json({ error: out.error });
  res.json({ answer: out.answer, toolsUsed: out.toolsUsed || [] });
});

export default router;
