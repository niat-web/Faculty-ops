import { useMemo, useState } from "react";
import { BookOpen, Search, ChevronRight } from "lucide-react";
import { DOCS } from "../docs";
import Markdown from "../components/Markdown";

// Documentation — a full-bleed, full-page two-pane reader: left = grouped section menu + search,
// right = the selected section rendered from Markdown. PUBLIC standalone page (no app shell, no login)
// at /docs; content is static (no API calls), opened in a new tab from Settings. Fills the whole
// viewport width with no outer max-width so long tables/fields have room to breathe.
export default function DocsPage() {
  const [activeId, setActiveId] = useState(DOCS[0].id);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? DOCS.filter((d) => (d.title + " " + d.body).toLowerCase().includes(n)) : DOCS;
  }, [q]);

  // Group sections in nav order, preserving first-seen group order.
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, typeof DOCS>();
    for (const d of filtered) { if (!map.has(d.group)) { map.set(d.group, []); order.push(d.group); } map.get(d.group)!.push(d); }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [filtered]);

  const active = DOCS.find((d) => d.id === activeId) || DOCS[0];
  const idx = DOCS.findIndex((d) => d.id === active.id);
  const prev = idx > 0 ? DOCS[idx - 1] : null;
  const next = idx < DOCS.length - 1 ? DOCS[idx + 1] : null;
  const pick = (id: string) => { setActiveId(id); document.getElementById("doc-scroll")?.scrollTo({ top: 0 }); };

  return (
    // Full-viewport, full-width standalone page. No outer max-width, no side gutters.
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white">
      {/* Top bar spans the whole width */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3.5 sm:px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm"><BookOpen className="h-5 w-5" /></span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold leading-tight text-slate-900">FacultyOps Documentation</h1>
          <p className="truncate text-xs text-slate-500">How every page works, each field, and where the data comes from.</p>
        </div>
        <span className="ml-auto hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 sm:inline">{DOCS.length} sections</span>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left — section menu (fixed-width rail, its own scroll) */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60">
          <div className="shrink-0 border-b border-slate-200 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs…" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {groups.map(({ group, items }) => (
              <div key={group} className="mb-3">
                <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
                {items.map((d) => {
                  const on = activeId === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => pick(d.id)}
                      className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        on ? "bg-brand-600 font-medium text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-900"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-white" : "bg-slate-300 group-hover:bg-brand-400"}`} />
                      <span className="truncate">{d.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {!filtered.length && <div className="px-3 py-6 text-center text-sm text-slate-400">No section matches “{q}”.</div>}
          </nav>
        </aside>

        {/* Right — content, fills the rest of the width */}
        <section id="doc-scroll" className="min-h-0 flex-1 overflow-y-auto bg-white">
          <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10 lg:px-14">
            {/* Breadcrumb */}
            <div className="mb-5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <span>{active.group}</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-slate-600">{active.title}</span>
            </div>

            <Markdown source={active.body} />

            {/* Prev / next pager */}
            <div className="mt-12 grid gap-3 border-t border-slate-100 pt-6 sm:grid-cols-2">
              {prev ? (
                <button onClick={() => pick(prev.id)} className="flex flex-col items-start rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">← Previous</span>
                  <span className="mt-0.5 text-sm font-medium text-slate-800">{prev.title}</span>
                </button>
              ) : <span />}
              {next ? (
                <button onClick={() => pick(next.id)} className="flex flex-col items-end rounded-xl border border-slate-200 px-4 py-3 text-right transition hover:border-brand-300 hover:bg-brand-50/40 sm:col-start-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Next →</span>
                  <span className="mt-0.5 text-sm font-medium text-slate-800">{next.title}</span>
                </button>
              ) : <span />}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
