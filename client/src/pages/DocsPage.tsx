import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Search, ChevronRight } from "lucide-react";
import { DOCS, getDocsForRole } from "../docs";
import { ROLE_LABEL } from "../auth";
import Markdown from "../components/Markdown";

const VALID_ROLES = new Set(["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"]);

function parseRole(raw: string | null): string | null {
  if (!raw) return null;
  const role = raw.trim().toUpperCase().replace(/-/g, "_");
  return VALID_ROLES.has(role) ? role : null;
}

/** Public standalone documentation at /docs — no login. Optional ?role= filters sections. */
export default function DocsPage() {
  const [searchParams] = useSearchParams();
  const role = parseRole(searchParams.get("role"));
  const sections = useMemo(() => (role ? getDocsForRole(role) : DOCS), [role]);

  const [activeId, setActiveId] = useState(sections[0]?.id || "");
  const [q, setQ] = useState("");

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

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
  const pick = (id: string) => { setActiveId(id); document.getElementById("doc-content-scroll")?.scrollTo({ top: 0 }); };

  if (!sections.length) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-sm text-slate-500">
        No documentation sections match this role.
      </div>
    );
  }

  const roleLabel = role ? ROLE_LABEL[role] || role : null;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-white">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <BookOpen className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight text-slate-900 sm:text-lg">FacultyOps Documentation</h1>
          <p className="truncate text-xs text-slate-500">
            {roleLabel ? `Guide for ${roleLabel} — ${sections.length} sections` : `Complete reference — ${sections.length} sections`}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 sm:inline">
          {sections.length} sections
        </span>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left nav — fixed header search + independently scrollable menu */}
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-slate-50/80 sm:w-72">
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
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5">
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

        {/* Right content — scrolls independently per selected section */}
        <section id="doc-content-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
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
  );
}
