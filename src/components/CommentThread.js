"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Send } from "lucide-react";

// Lightweight comment thread shown on a pending edit request.
export default function CommentThread({ requestId, comments }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const res = await fetch("/api/requests/comment", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, body }),
    });
    setBusy(false);
    if (res.ok) { setBody(""); router.refresh(); }
  }

  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <MessageSquare className="h-3.5 w-3.5" /> Discussion ({comments.length})
      </div>
      <div className="space-y-2">
        {comments.map((c) => (
          <div key={c.id} className="text-sm">
            <span className="font-medium text-slate-700">{c.authorName}</span>{" "}
            <span className="text-slate-600">{c.body}</span>
            <span className="ml-1 text-[11px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</span>
          </div>
        ))}
        {comments.length === 0 && <p className="text-xs text-slate-400">No comments yet.</p>}
      </div>
      <form onSubmit={send} className="mt-2 flex gap-2">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        <button className="btn btn-primary btn-sm" disabled={busy}><Send className="h-3.5 w-3.5" /></button>
      </form>
    </div>
  );
}
