import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Users2, UserCog, ArrowRight, ChevronDown, ChevronRight, UserX, Plus, Minus, Maximize2, Download, ShieldCheck } from "lucide-react";
import { useCachedGet } from "../hooks";
import { useToast } from "../toast";
import { GridSkeleton } from "../components/skeletons";

// Per-branch colour (node accent + connector line) so each Senior Manager's tree is distinct.
const BRANCH = [
  { hex: "#6366f1", avatar: "bg-brand-100 text-brand-700", chip: "bg-brand-50 text-brand-700" },
  { hex: "#06b6d4", avatar: "bg-cyan-100 text-cyan-700", chip: "bg-cyan-50 text-cyan-700" },
  { hex: "#22c55e", avatar: "bg-emerald-100 text-emerald-700", chip: "bg-emerald-50 text-emerald-700" },
  { hex: "#a855f7", avatar: "bg-violet-100 text-violet-700", chip: "bg-violet-50 text-violet-700" },
  { hex: "#ec4899", avatar: "bg-pink-100 text-pink-700", chip: "bg-pink-50 text-pink-700" },
];
const AMBER = { hex: "#f59e0b", avatar: "bg-amber-100 text-amber-700", chip: "bg-amber-50 text-amber-700" };
// Ops Admins branch — distinct indigo accent to read as "organization-wide admins".
const OPS_ACCENT = { hex: "#4f46e5", avatar: "bg-indigo-100 text-indigo-700", chip: "bg-indigo-50 text-indigo-700" };

const MIN_ZOOM = 0.3, MAX_ZOOM = 2.2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function OrgPage() {
  const { data: raw, error: err } = useCachedGet<any>("/org");
  const toast = useToast();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [paths, setPaths] = useState<{ d: string; color: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const navigate = useNavigate();

  // Pan/zoom of the chart inside its viewport.
  const [zoom, setZoom] = useState(0.56);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const panRef = useRef(pan); panRef.current = pan;
  const [exporting, setExporting] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nodes = useRef<Record<string, HTMLElement | null>>({});
  const setNode = (id: string) => (el: HTMLElement | null) => { nodes.current[id] = el; };

  const seniors: any[] = raw?.seniors || [];
  const unassigned: any[] = raw?.unassignedCMs || [];
  const opsAdmins: any[] = raw?.opsAdmins || [];
  const needle = q.trim().toLowerCase();
  const cmTotal = seniors.reduce((n, s) => n + (s.capabilityManagers?.length || 0), 0) + unassigned.length;

  // Search NEVER filters the chart — the whole tree always renders. Typing a name highlights the
  // matching node(s) and auto-pans/zooms the first match into view (see the centre-on effect below).
  const hit = (name: any) => !!needle && String(name || "").toLowerCase().includes(needle);

  // Branch list = an "Ops Admins" group (top) + senior managers + an "Unassigned" branch (always present).
  const branches = useMemo(() => {
    const list = seniors.map((s, i) => ({ ...s, _id: s.id, accent: BRANCH[i % BRANCH.length] }));
    if (opsAdmins.length) list.unshift({ _id: "OPS", name: "Ops Admins", capabilityManagers: opsAdmins, accent: OPS_ACCENT, _ops: true } as any);
    if (unassigned.length) list.push({ _id: "UNASSIGNED", name: "Unassigned", capabilityManagers: unassigned, accent: AMBER, _unassigned: true } as any);
    return list;
  }, [seniors, unassigned, opsAdmins]);

  // Expanded by default; an active search forces every branch open so any matched CM is visible/scroll-able.
  // The Ops Admins group is collapsed by default (long list) unless searching — click to expand.
  const isOpen = (id: string) => (needle ? true : open[id] ?? (id === "OPS" ? false : true));

  // Draw curved connectors between the measured node boxes. Coordinates are divided by the
  // current zoom so they stay in the chart's UN-scaled layout space (the SVG lives inside the
  // transformed stage, so it gets scaled along with the nodes → stays aligned at any zoom).
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const z = zoomRef.current || 1;
      const wr = wrap.getBoundingClientRect();
      const conns: { d: string; color: string }[] = [];
      const link = (fromId: string, toId: string, color: string) => {
        const a = nodes.current[fromId], b = nodes.current[toId];
        if (!a || !b) return;
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        const x1 = (ar.right - wr.left) / z, y1 = (ar.top - wr.top) / z + ar.height / z / 2;
        const x2 = (br.left - wr.left) / z, y2 = (br.top - wr.top) / z + br.height / z / 2;
        const dx = Math.max(28, (x2 - x1) / 2);
        conns.push({ d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, color });
      };
      branches.forEach((b: any) => {
        link("ORG", b._id, b.accent.hex);
        if (isOpen(b._id)) (b.capabilityManagers || []).forEach((cm: any) => link(b._id, cm.id, b.accent.hex));
      });
      setPaths(conns);
      setSize({ w: wrap.offsetWidth, h: wrap.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [branches, open, needle]);

  // Live search → pan/zoom the FIRST matching node to the centre of the viewport (no re-search, no
  // filtering). Runs after the branches render (all forced open while searching) so the node exists.
  const firstMatchId = useCallback((): string | null => {
    if (!needle) return null;
    for (const b of branches) {
      if (String(b.name || "").toLowerCase().includes(needle) && b._id !== "OPS" && b._id !== "UNASSIGNED") return b._id;
      for (const cm of b.capabilityManagers || []) if (String(cm.name || "").toLowerCase().includes(needle)) return cm.id;
    }
    // fall back to a matching branch header (Ops Admins / Unassigned) if only those matched
    for (const b of branches) if (String(b.name || "").toLowerCase().includes(needle)) return b._id;
    return null;
  }, [branches, needle]);

  useEffect(() => {
    if (!needle) return;
    const raf = requestAnimationFrame(() => {
      const id = firstMatchId();
      const vp = viewportRef.current, wrap = wrapRef.current, node = id ? nodes.current[id] : null;
      if (!vp || !wrap || !node) return;
      const z = zoomRef.current || 1;
      const wr = wrap.getBoundingClientRect(), nr = node.getBoundingClientRect();
      // node centre in the stage's UN-scaled coordinate space
      const cxU = (nr.left - wr.left) / z + nr.width / z / 2;
      const cyU = (nr.top - wr.top) / z + nr.height / z / 2;
      const Z = 0.8; // readable zoom for the focused node
      setZoom(Z);
      setPan({ x: vp.clientWidth / 2 - cxU * Z, y: vp.clientHeight / 2 - cyU * Z });
    });
    return () => cancelAnimationFrame(raf);
  }, [needle, branches, firstMatchId]);

  // Wheel-zoom toward the cursor (native non-passive listener so we can preventDefault).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
      const z = zoomRef.current, p = panRef.current;
      const nz = clamp(z * (e.deltaY < 0 ? 1.12 : 0.89), MIN_ZOOM, MAX_ZOOM);
      if (nz === z) return;
      setPan({ x: cx - ((cx - p.x) * nz) / z, y: cy - ((cy - p.y) * nz) / z });
      setZoom(nz);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  // Drag-to-pan (ignore drags that start on a button/link so node clicks still work).
  const onPointerDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, px: panRef.current.x, py: panRef.current.y };
    const move = (ev: MouseEvent) => setPan({ x: start.px + (ev.clientX - start.x), y: start.py + (ev.clientY - start.y) });
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, []);

  const zoomBy = (f: number) => setZoom((z) => clamp(z * f, MIN_ZOOM, MAX_ZOOM));
  const resetView = () => { setZoom(0.56); setPan({ x: 40, y: 40 }); };

  async function exportPng() {
    if (!wrapRef.current) return;
    setExporting(true);
    try {
      // Dynamic import: html-to-image (~a few KB) loads only when the user actually exports, keeping it out
      // of the Org page's initial chunk.
      const { toPng } = await import("html-to-image");
      const url = await toPng(wrapRef.current, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a"); a.href = url; a.download = "org-chart.png"; a.click();
    } catch { toast.error("Couldn't export the chart. Try collapsing some branches and retry."); }
    finally { setExporting(false); }
  }

  if (err && !raw) return <div className="card p-6 text-sm text-rose-600">{err}</div>;
  if (!raw) return <GridSkeleton />;

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !(o[id] ?? true) }));
  const setAll = (v: boolean) => setOpen(Object.fromEntries(branches.map((b: any) => [b._id, v])));
  const instr = (b: any) => (b.capabilityManagers || []).reduce((n: number, c: any) => n + (c.reportees || 0), 0);

  // Split branches: the Ops Admins group renders in its own node/cards columns (2 & 3);
  // Senior Managers (+ Unassigned) render in columns 4 & 5.
  const opsBranch = branches.find((b: any) => b._ops);
  const mgrBranches = branches.filter((b: any) => !b._ops);

  // A manager/group node card (Ops Admins, Senior Manager, or Unassigned).
  const renderNode = (b: any) => {
    const cms: any[] = b.capabilityManagers || [];
    const expanded = isOpen(b._id);
    return (
      <div ref={setNode(b._id)} className={`w-64 shrink-0 rounded-2xl border bg-white shadow-sm transition ${hit(b.name) ? "border-brand-500 ring-2 ring-brand-400 ring-offset-2" : "border-slate-200"}`}>
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${b.accent.avatar}`}>{b._unassigned ? <UserX className="h-5 w-5" /> : b._ops ? <ShieldCheck className="h-5 w-5" /> : b.name.charAt(0)}</span>
          <div className="min-w-0 flex-1"><div className="truncate font-semibold text-slate-800">{b.name}</div><div className="text-[11px] text-slate-400">{b._unassigned ? "No Senior Manager" : b._ops ? "Organization admins" : "Senior Manager"}</div></div>
          {cms.length > 0 && (
            <button onClick={() => toggle(b._id)} title={expanded ? "Collapse" : "Expand"} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          )}
        </div>
        <div className="flex gap-2 border-t border-slate-100 px-3.5 py-2 text-[11px]">
          {b._ops ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${b.accent.chip}`}><ShieldCheck className="h-3 w-3" /> {cms.length} Admin{cms.length === 1 ? "" : "s"}</span>
          ) : (
            <>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${b.accent.chip}`}><UserCog className="h-3 w-3" /> {cms.length} CM</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700"><Users2 className="h-3 w-3" /> {instr(b)}</span>
            </>
          )}
        </div>
      </div>
    );
  };

  // A child card — an Ops Admin (static) or a Capability Manager (click → filtered master grid).
  const renderChild = (b: any, cm: any) => b._ops ? (
    <div key={cm.id} ref={setNode(cm.id)} className={`flex w-56 shrink-0 items-center gap-2.5 rounded-xl border bg-white p-2.5 shadow-sm transition ${hit(cm.name) ? "border-brand-500 ring-2 ring-brand-400 ring-offset-2" : "border-slate-200"}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${b.accent.avatar}`}>{cm.name.charAt(0)}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{cm.name}</span><span className="block text-[11px] text-slate-400">Ops Admin</span></span>
    </div>
  ) : (
    <button key={cm.id} ref={setNode(cm.id)} onClick={() => navigate(cm.rmid ? `/app/instructors/master?rmid=${encodeURIComponent(cm.rmid)}&rmname=${encodeURIComponent(cm.name)}` : `/app/instructors/master?managerId=${cm.id}`)}
      className={`group flex w-56 shrink-0 items-center gap-2.5 rounded-xl border bg-white p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${hit(cm.name) ? "border-brand-500 ring-2 ring-brand-400 ring-offset-2" : "border-slate-200 hover:border-brand-300"}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">{cm.name.charAt(0)}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{cm.name}</span><span className="block text-[11px] text-slate-400">{cm.reportees} instructor{cm.reportees === 1 ? "" : "s"}</span></span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Full-height viewport: chart pans/zooms INSIDE this; the page itself never scrolls. */}
      <div ref={viewportRef} onMouseDown={onPointerDown} className="card relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing">
        {/* Controls INSIDE the chart, top-right — search + expand/collapse. */}
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search manager…" className="input w-56 bg-white/95 pl-9 shadow-sm backdrop-blur" />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 p-0.5 shadow-sm backdrop-blur">
            <button onClick={() => setAll(true)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">Expand all</button>
            <button onClick={() => setAll(false)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">Collapse all</button>
          </div>
        </div>

        {/* Zoom toolbar (bottom-right, out of the way of the top controls). */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-md">
          <ToolBtn title="Zoom in" onClick={() => zoomBy(1.15)}><Plus className="h-4 w-4" /></ToolBtn>
          <div className="px-1 text-center text-[10px] font-medium tabular-nums text-slate-400">{Math.round(zoom * 100)}%</div>
          <ToolBtn title="Zoom out" onClick={() => zoomBy(0.87)}><Minus className="h-4 w-4" /></ToolBtn>
          <div className="my-0.5 border-t border-slate-100" />
          <ToolBtn title="Reset / fit" onClick={resetView}><Maximize2 className="h-4 w-4" /></ToolBtn>
          <ToolBtn title="Export as PNG" onClick={exportPng} disabled={exporting}><Download className="h-4 w-4" /></ToolBtn>
        </div>

        {/* Transformed stage (pan + zoom). transformOrigin 0 0 keeps the math simple. */}
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          <div ref={wrapRef} className="relative inline-flex items-center gap-20 p-8">
            {/* connector layer */}
            <svg width={size.w} height={size.h} className="pointer-events-none absolute left-0 top-0 z-0" style={{ overflow: "visible" }}>
              {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={2.5} strokeOpacity={0.5} strokeLinecap="round" />)}
            </svg>

            {/* Column 1 — Organization */}
            <div ref={setNode("ORG")} className="relative z-10 w-56 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-600 text-white shadow-md">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20"><Building2 className="h-5 w-5" /></span>
                <div className="min-w-0"><div className="truncate text-sm font-bold">NIAT — FacultyOps</div><div className="text-[11px] text-white/80">Organization</div></div>
              </div>
              <div className="flex divide-x divide-white/15 border-t border-white/15 text-center text-[11px]">
                <div className="flex-1 py-1.5"><div className="text-sm font-bold leading-none">{raw.totalInstructors || 0}</div><div className="text-white/70">Instr.</div></div>
                <div className="flex-1 py-1.5"><div className="text-sm font-bold leading-none">{seniors.length}</div><div className="text-white/70">Sr Mgr</div></div>
                <div className="flex-1 py-1.5"><div className="text-sm font-bold leading-none">{cmTotal}</div><div className="text-white/70">Cap Mgr</div></div>
              </div>
            </div>

            {/* Columns 2 & 3 — Ops Admins node + (when expanded) their name cards */}
            {opsBranch && (
              <div className="relative z-10 flex items-center gap-20">
                {renderNode(opsBranch)}
                {isOpen("OPS") && (opsBranch.capabilityManagers || []).length > 0 && (
                  <div className="flex flex-col gap-3">{(opsBranch.capabilityManagers || []).map((o: any) => renderChild(opsBranch, o))}</div>
                )}
              </div>
            )}

            {/* Columns 4 & 5 — Senior Managers + their Capability Managers (each SM aligns with its CM column) */}
            <div className="relative z-10 flex flex-col gap-6">
              {mgrBranches.length === 0 && <div className="px-6 py-4 text-sm text-slate-400">No managers to show yet.</div>}
              {mgrBranches.map((b: any) => {
                const cms: any[] = b.capabilityManagers || [];
                const expanded = isOpen(b._id);
                return (
                  <div key={b._id} className="flex items-center gap-20">
                    {renderNode(b)}
                    {expanded && cms.length > 0 && (
                      <div className="flex flex-col gap-3">{cms.map((cm) => renderChild(b, cm))}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-brand-600 disabled:opacity-40">
      {children}
    </button>
  );
}
