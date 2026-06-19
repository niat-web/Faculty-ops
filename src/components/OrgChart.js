"use client";

import { useRef, useState, useLayoutEffect, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Network, GraduationCap, Plus, Minus, Maximize2, Minimize2,
  Locate, ChevronDown, ChevronRight, FoldVertical, UnfoldVertical,
} from "lucide-react";

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function OrgChart({ data }) {
  const wrapRef = useRef(null);
  const contentRef = useRef(null);
  const nodeEls = useRef({});
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [isFull, setIsFull] = useState(false);
  const [edges, setEdges] = useState([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef({ active: false, x: 0, y: 0, moved: false });
  const suppressClick = useRef(false);

  const setRef = (id) => (el) => { if (el) nodeEls.current[id] = el; };

  // Compute orthogonal connector paths (left→right, with a shared bus per parent).
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const m = (id) => { const el = nodeEls.current[id]; return el ? { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null; };
    const paths = [];
    const connect = (pid, cid) => {
      const p = m(pid), c = m(cid);
      if (!p || !c) return;
      const px = p.l + p.w, py = p.t + p.h / 2;
      const cx = c.l, cy = c.t + c.h / 2;
      const midX = px + Math.max(18, (cx - px) / 2);
      paths.push(`M ${px} ${py} H ${midX} V ${cy} H ${cx}`);
    };
    data.sms.forEach((sm) => {
      connect("org", sm.id);
      if (!collapsed.has(sm.id)) sm.cms.forEach((cm) => connect(sm.id, cm.id));
    });
    setEdges(paths);
    setSize({ w: content.offsetWidth, h: content.offsetHeight });
  }, [collapsed, data]);

  const fit = useCallback(() => {
    const w = wrapRef.current, c = contentRef.current;
    if (!w || !c) return;
    const cw = w.clientWidth, ch = w.clientHeight;
    const tw = c.offsetWidth, th = c.offsetHeight;
    if (!tw || !th) return;
    const s = clamp(Math.min(cw / tw, ch / th) * 0.95, 0.4, 1.2);
    setScale(s);
    setTx(tw * s <= cw ? (cw - tw * s) / 2 : 24);
    setTy(th * s <= ch ? (ch - th * s) / 2 : 24);
  }, []);

  useLayoutEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit]);

  // Wheel zoom toward the cursor.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setScale((s) => {
        const ns = clamp(s * (e.deltaY < 0 ? 1.12 : 0.89), 0.2, 2.5);
        const k = ns / s;
        setTx((t) => mx - (mx - t) * k);
        setTy((t) => my - (my - t) * k);
        return ns;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Drag to pan.
  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return;
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
      setTx((t) => t + dx); setTy((t) => t + dy);
      drag.current.x = e.clientX; drag.current.y = e.clientY;
    };
    const onUp = () => {
      if (drag.current.moved) { suppressClick.current = true; setTimeout(() => (suppressClick.current = false), 50); }
      drag.current.active = false;
      if (wrapRef.current) wrapRef.current.style.cursor = "grab";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  function onDown(e) {
    drag.current = { active: true, x: e.clientX, y: e.clientY, moved: false };
    if (wrapRef.current) wrapRef.current.style.cursor = "grabbing";
  }
  function zoomBy(f) {
    setScale((s) => {
      const ns = clamp(s * f, 0.2, 2.5);
      const w = wrapRef.current;
      if (w) { const cw = w.clientWidth / 2, ch = w.clientHeight / 2, k = ns / s;
        setTx((t) => cw - (cw - t) * k); setTy((t) => ch - (ch - t) * k); }
      return ns;
    });
  }
  function toggleSm(id) { setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  const allCollapsed = data.sms.length > 0 && data.sms.every((s) => collapsed.has(s.id));
  function toggleAll() { setCollapsed(allCollapsed ? new Set() : new Set(data.sms.map((s) => s.id))); }
  function fullscreen() {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) { el.requestFullscreen?.(); setIsFull(true); }
    else { document.exitFullscreen?.(); setIsFull(false); }
  }
  useEffect(() => {
    const h = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const CmNode = ({ cm }) => (
    <Link
      ref={setRef(cm.id)}
      href={`/app/instructors?managerId=${cm.id}`}
      onClick={(e) => { if (suppressClick.current) e.preventDefault(); }}
      draggable={false}
      className="oc-card group block w-48 select-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-600">{initials(cm.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-800 group-hover:text-brand-700">{cm.name}</span>
          <span className="block text-[11px] text-slate-400">Capability Manager</span>
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5">
        <span className="text-[11px] text-slate-400">Reportees</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"><GraduationCap className="h-3 w-3" /> {cm.count}</span>
      </div>
    </Link>
  );

  const Btn = ({ onClick, title, children }) => (
    <button onClick={onClick} title={title} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">{children}</button>
  );

  return (
    <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "22px 22px", opacity: 0.5 }} />

      <div className="absolute right-4 top-4 z-10 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <Btn onClick={() => zoomBy(1.2)} title="Zoom in"><Plus className="h-4 w-4" /></Btn>
        <Btn onClick={() => zoomBy(0.83)} title="Zoom out"><Minus className="h-4 w-4" /></Btn>
        <Btn onClick={fit} title="Fit to screen"><Locate className="h-4 w-4" /></Btn>
        <Btn onClick={toggleAll} title={allCollapsed ? "Expand all" : "Collapse all"}>{allCollapsed ? <UnfoldVertical className="h-4 w-4" /> : <FoldVertical className="h-4 w-4" />}</Btn>
        <Btn onClick={fullscreen} title={isFull ? "Exit fullscreen" : "Fullscreen"}>{isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Btn>
      </div>
      <div className="absolute bottom-4 right-4 z-10 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-500 shadow-sm backdrop-blur">{Math.round(scale * 100)}%</div>
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded bg-gradient-to-br from-brand-600 to-brand-800" /> Organization</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded bg-brand-200" /> Senior Manager</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded border border-slate-300 bg-white" /> Capability Manager</span>
      </div>

      <div ref={wrapRef} onMouseDown={onDown} className="absolute inset-0 cursor-grab" style={{ touchAction: "none" }}>
        <div ref={contentRef} className="relative inline-block origin-top-left p-6" style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
          {/* connectors */}
          <svg className="absolute left-0 top-0" width={size.w} height={size.h} style={{ zIndex: 0, overflow: "visible", pointerEvents: "none" }}>
            <defs>
              <marker id="oc-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0 0 L6 4 L0 8 Z" fill="#94a3b8" />
              </marker>
            </defs>
            {edges.map((d, i) => <path key={i} d={d} fill="none" stroke="#94a3b8" strokeWidth={2} markerEnd="url(#oc-arrow)" />)}
          </svg>

          {/* left→right flow tree */}
          <div className="relative flex items-center" style={{ zIndex: 1 }}>
            {/* Organization root */}
            <div ref={setRef("org")} className="oc-card inline-flex select-none items-center gap-2.5 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-3 text-white shadow-soft">
              <Network className="h-5 w-5" />
              <div className="text-left">
                <div className="text-sm font-bold leading-tight">NIAT · FacultyOps</div>
                <div className="text-[11px] text-brand-100">{data.totalInstructors} instructors · {data.totalManagers} managers</div>
              </div>
            </div>

            {/* Senior Managers column */}
            <div className="ml-16 flex flex-col gap-4">
              {data.sms.map((sm) => {
                const isCollapsed = collapsed.has(sm.id);
                return (
                  <div key={sm.id} className="flex items-center">
                    <button
                      ref={setRef(sm.id)}
                      onClick={() => { if (!suppressClick.current && sm.cms.length) toggleSm(sm.id); }}
                      className="oc-card w-56 select-none rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2.5 text-left shadow-sm transition hover:border-brand-300"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{initials(sm.name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800">{sm.name}</span>
                          <span className="block text-[11px] text-brand-600">Senior Manager · {sm.cms.length} CM{sm.cms.length === 1 ? "" : "s"}</span>
                        </span>
                        {sm.cms.length > 0 && (isCollapsed ? <ChevronRight className="h-4 w-4 text-brand-500" /> : <ChevronDown className="h-4 w-4 text-brand-500" />)}
                      </div>
                    </button>

                    {/* Capability Managers column for this SM */}
                    {sm.cms.length > 0 && !isCollapsed && (
                      <div className="ml-16 flex flex-col gap-3">
                        {sm.cms.map((cm) => <CmNode key={cm.id} cm={cm} />)}
                      </div>
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
