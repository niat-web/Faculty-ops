import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles, Loader2, RotateCcw } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Markdown from "./Markdown";

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);
  const sendingRef = useRef(false);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { abortRef.current?.abort(); setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  function resetChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    reqIdRef.current++;
    sendingRef.current = false;
    setMsgs([]);
    setInput("");
    setBusy(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  if (!user || !ALLOWED.has(user.role)) return null;
  const suggestions = SUGGESTIONS_BY_ROLE[user.role] || [];

  async function send(text: string) {
    const q = text.trim();
    if (!q || sendingRef.current || busy) return;
    sendingRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const reqId = ++reqIdRef.current;

    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api.post("/assistant/chat", { messages: next }, { silent: true, signal: ac.signal });
      if (reqId !== reqIdRef.current) return;
      setMsgs((m) => [...m, { role: "assistant", content: r.answer || "I couldn't produce an answer." }]);
    } catch (e: any) {
      if (reqId !== reqIdRef.current || e?.name === "AbortError") return;
      setMsgs((m) => [...m, { role: "assistant", content: e?.message || "The assistant is temporarily unavailable." }]);
    } finally {
      if (reqId === reqIdRef.current) {
        sendingRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700 max-sm:bottom-4 max-sm:right-4"
          title="Ask the FacultyOps assistant"
        >
          <Sparkles className="h-5 w-5" /> Ask AI
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="FacultyOps Assistant"
          className="fixed z-40 flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl bottom-6 right-6 h-[560px] max-h-[calc(100vh-3rem)] w-[400px] max-w-[calc(100vw-2rem)] rounded-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:right-0 max-sm:h-[min(100dvh,640px)] max-sm:max-h-[100dvh] max-sm:w-full max-sm:rounded-t-2xl max-sm:rounded-b-none"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-brand-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15"><MessageCircle className="h-4.5 w-4.5" /></span>
              <div>
                <div className="text-sm font-semibold leading-tight">FacultyOps Assistant</div>
                <div className="text-[11px] text-white/70">{user.role === "CAPABILITY_MANAGER" ? "Answers about your reportees" : "Answers about your instructors"}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={resetChat}
                disabled={!msgs.length && !input && !busy}
                title="Clear conversation"
                aria-label="Clear conversation"
                className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button onClick={() => { abortRef.current?.abort(); setOpen(false); }} title="Close" aria-label="Close assistant" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite" aria-relevant="additions">
            {!msgs.length && (
              <div className="space-y-3">
                <div className="rounded-xl bg-white p-3 text-sm text-slate-600 ring-1 ring-slate-100">
                  Hi {(user.name || "").split(" ")[0]} — ask me about your instructors. I answer from live data, scoped to what you can access.
                </div>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.role === "user" ? "whitespace-pre-wrap bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-100"}`}>
                  {m.role === "assistant" ? <Markdown source={m.content} variant="chat" /> : m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 text-sm text-slate-400 ring-1 ring-slate-100"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
              </div>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white px-3 py-2.5 max-sm:pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about instructors…"
              maxLength={1000}
              aria-label="Ask about instructors"
              className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <button type="submit" disabled={!input.trim() || busy} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
