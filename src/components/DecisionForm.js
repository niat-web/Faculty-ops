"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export default function DecisionForm({ requestId }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function decide(decision) {
    setBusy(true);
    const fd = new FormData();
    fd.set("requestId", requestId);
    fd.set("decision", decision);
    fd.set("comment", comment);
    const res = await fetch("/api/requests/decide", { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) router.refresh();
    else { const j = await res.json().catch(() => ({})); alert(j.error || "Failed"); }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        className="input max-w-xs flex-1"
        placeholder="Optional comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button className="btn btn-success btn-sm" disabled={busy} onClick={() => decide("APPROVE")}>
        <Check className="h-4 w-4" /> Approve
      </button>
      <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => decide("REJECT")}>
        <X className="h-4 w-4" /> Reject
      </button>
    </div>
  );
}
