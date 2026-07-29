import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Search, ChevronRight, ArrowLeft } from "lucide-react";
import { DOCS, getDocsForRole } from "../docs";
import { useAuth, ROLE_LABEL } from "../auth";
import Markdown from "../components/Markdown";

type DocsPageProps = { embedded?: boolean };

// Two-pane documentation reader: left = grouped section menu + search, right = Markdown content.
// Public standalone at /docs (all sections). In-app at /app/docs (filtered by signed-in role).
export default function DocsPage({ embedded = false }: DocsPageProps) {
  const { user } = useAuth();
  const role = embedded && user ? user.role : null;
  const sections = useMemo(() => (role ? getDocsForRole(role) : DOCS), [role]);

  const [activeId, setActiveId] = useState(sections[0]?.id || "");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!sections.some((d) => d.id === activeId)) setActiveId(sections[0]?.id || "");
  }, [sections, activeId]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? sections.filter((d) => (d.title + " " + d.body).toLowerCase().includes(n)) : sections;
  }, [q, sections]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, typeof sections>();
    for (const d of filtered) {
      if (!map.has(d.group)) { map.set(d.group, []); order.push(d.group); }
      map.get(d.group)!.push(d);
    }
    return order.map((g) => ({ group: g, items: map.get(g)! }));
  }, [filtered]);

  const active = sections.find((d) => d.id === activeId) || sections[0];
  const idx = active ? sections.findIndex((d) => d.id === active.id) : -1;
  const prev = idx > 0 ? sections[idx - 1] : null;
  const next = idx >= 0 && idx < sections.length - 1 ? sections[idx + 1] : null;
  const pick = (id: string) => { setActiveId(id); document.getElementById("doc-scroll")?.scrollTo({ top: 0 }); };

  if (!sections.length) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        No documentation sections are available for your role.
      </div>
    );
  }

  const roleLabel = role ? ROLE_LABEL[role] || role : null;

  const shellClass = embedded
    ? "flex min-h-[calc(100vh-4rem)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:min-h-[calc(100vh-2.5rem)]"
    : "flex h-screen w-full flex-col overflow-hidden bg-white";

  return (
    <div className={embedded ? "-mx-4 -my-5 sm:-mx-6 lg:-mx-8" : ""}>
      <div className={shellClass}>
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          {embedded && (
            <Link to="/app" className="hidden rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:inline-flex" aria-label="Back to app">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          )}
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight text-slate-900 sm:text-lg">
              {embedded ? "Documentation" : "FacultyOps Documentation"}
            </h1>
            <p className="truncate text-xs text-slate-500">
              {embedded && roleLabel
                ? `Guide for ${roleLabel} — ${sections.length} sections`
                : "How every page works, each field, and where the data comes from."}
            </p>
          </div>
          <span className="hidden shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 sm:inline">
            {sections.length} sections
          </span>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/80 sm:w-72">
            <div className="shrink-0 border-b border-slate-200 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search docs…"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
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
              {!filtered.length && (
                <div className="px-3 py-6 text-center text-sm text-slate-400">No section matches “{q}”.</div>
              )}
            </nav>
          </aside>

          <section id="doc-scroll" className="min-h-0 flex-1 overflow-y-auto bg-white">
            {active && (
              <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8 lg:px-12">
                <div className="mb-5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <span>{active.group}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="text-slate-600">{active.title}</span>
                </div>

                <Markdown source={active.body} />

                <div className="mt-12 grid gap-3 border-t border-slate-100 pt-6 sm:grid-cols-2">
                  {prev ? (
                    <button
                      onClick={() => pick(prev.id)}
                      className="flex flex-col items-start rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">← Previous</span>
                      <span className="mt-0.5 text-sm font-medium text-slate-800">{prev.title}</span>
                    </button>
                  ) : <span />}
                  {next ? (
                    <button
                      onClick={() => pick(next.id)}
                      className="flex flex-col items-end rounded-xl border border-slate-200 px-4 py-3 text-right transition hover:border-brand-300 hover:bg-brand-50/40 sm:col-start-2"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Next →</span>
                      <span className="mt-0.5 text-sm font-medium text-slate-800">{next.title}</span>
                    </button>
                  ) : <span />}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
