import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";

// Dashboard-only AI assistant — a floating button (bottom-right) that opens a chat panel. Shown ONLY to
// Ops Admin / Senior Manager / Capability Manager. Every answer is role-scoped server-side: a Capability
// Manager's questions are limited to THEIR reportees (the model can't reach out-of-scope data).
type Msg = { role: "user" | "assistant"; content: string };
const ALLOWED = new Set(["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER"]);

const SUGGESTIONS_BY_ROLE: Record<string, string[]> = {
  OPS_ADMIN: ["How many active instructors are there?", "How many joined in July?", "How many are in NIAT 4 (2026)?", "Show instructor stats by campus"],
  SENIOR_MANAGER: ["How many active instructors?", "Average training completion?", "How many joined last month?", "Break down by contribution"],
  CAPABILITY_MANAGER: ["How many reportees do I have?", "My team's average training?", "Which of my reportees are at risk?", "Why did an instructor move teams?"],
};

export default function DashboardAssistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  if (!user || !ALLOWED.has(user.role)) return null; // hidden for instructors / logged-out
  const suggestions = SUGGESTIONS_BY_ROLE[user.role] || [];

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await api.post("/assistant/chat", { messages: next }, { silent: true });
      setMsgs((m) => [...m, { role: "assistant", content: r.answer || "I couldn't produce an answer." }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", content: e?.message || "The assistant is temporarily unavailable." }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* Floating launcher — bottom-right of the Dashboard only. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700"
          title="Ask the FacultyOps assistant"
        >
          <Sparkles className="h-5 w-5" /> Ask AI
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[560px] max-h-[calc(100vh-3rem)] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-brand-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15"><MessageCircle className="h-4.5 w-4.5" /></span>
              <div>
                <div className="text-sm font-semibold leading-tight">FacultyOps Assistant</div>
                <div className="text-[11px] text-white/70">{user.role === "CAPABILITY_MANAGER" ? "Answers about your reportees" : "Answers about your instructors"}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Reset — clear the conversation and start fresh. */}
              <button
                onClick={() => { setMsgs([]); setInput(""); setBusy(false); setTimeout(() => inputRef.current?.focus(), 50); }}
                disabled={!msgs.length && !input}
                title="Clear conversation"
                className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen(false)} title="Close" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {!msgs.length && (
              <div className="space-y-3">
                <div className="rounded-xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-100">
                  Hi {(user.name || "").split(" ")[0]} 👋 — ask me about your instructors. I answer from live data, scoped to what you can access.
                </div>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-brand-300 hover:bg-brand-50/50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-100"}`}>{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 text-sm text-slate-400 ring-1 ring-slate-100"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about instructors…"
              maxLength={1000}
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <button type="submit" disabled={!input.trim() || busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
