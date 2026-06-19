"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, X } from "lucide-react";
import { useUI } from "./UIProvider.js";

// Personal saved filter views for the instructor list.
export default function SavedViews({ views, currentQuery }) {
  const router = useRouter();
  const ui = useUI();

  async function save() {
    const name = await ui.prompt({ title: "Save current view", placeholder: "e.g. Pune · low training", confirmText: "Save" });
    if (!name) return;
    const res = await fetch("/api/views", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "save", name, query: currentQuery }),
    });
    if (res.ok) { router.refresh(); ui.toast("View saved"); }
    else { const j = await res.json().catch(() => ({})); ui.toast(j.error || "Failed", "error"); }
  }

  async function remove(id) {
    const res = await fetch("/api/views", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "delete", id }),
    });
    if (res.ok) { router.refresh(); ui.toast("View removed"); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-medium text-slate-400"><Bookmark className="h-3.5 w-3.5" /> Views:</span>
      {views.length === 0 && <span className="text-xs text-slate-400">none yet</span>}
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs text-slate-600">
          <Link href={`/app/instructors${v.query ? `?${v.query}` : ""}`} className="hover:text-brand-700">{v.name}</Link>
          <button onClick={() => remove(v.id)} className="rounded-full p-0.5 hover:bg-slate-200" aria-label="Remove view"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <button onClick={save} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600">
        <BookmarkPlus className="h-3.5 w-3.5" /> Save current
      </button>
    </div>
  );
}
