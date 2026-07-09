import { useEffect, useRef, useState } from "react";
import { Search, Plus, Mail, Pencil, Trash2, Copy, SlidersHorizontal, X } from "lucide-react";
import { api } from "../api";
import { ROLE_LABEL } from "../auth";
import { useDebouncedValue, isAbort } from "../hooks";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import ScrollSelect from "../components/ScrollSelect";
import { useSort, SortHeader } from "../components/SortHeader";
import RowActionsMenu from "../components/RowActionsMenu";
import { SkeletonRows } from "../components/scaffold";

const ROLES = ["OPS_ADMIN", "SENIOR_MANAGER", "CAPABILITY_MANAGER", "INSTRUCTOR"];
type Filters = { role: string; managerId: string; status: string; live: string };
const EMPTY_FILTERS: Filters = { role: "", managerId: "", status: "", live: "" };

// Absolute date+time, e.g. "21 Jun 2026, 5:54 PM".
function fmtDateTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
// Compact relative time, e.g. "just now", "5m ago", "3h ago", "2d ago".
function fmtRelative(iso: string | null): string {
  if (!iso) return "Never";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24); if (dd < 30) return `${dd}d ago`;
  return fmtDateTime(iso);
}

export default function UsersPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const dq = useDebouncedValue(q, 300);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(50);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null); // user object or {} for new
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ link: string; email: string; delivered: boolean } | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const sort = useSort();
  // Roles quick-filter (checkbox dropdown next to the heading, like the Master's "Departments" filter).
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set(ROLES));
  const [roleOpen, setRoleOpen] = useState(false);
  const toggleRole = (r: string) => { setPage(1); setRoleFilter((s) => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n; }); };
  const setAllRoles = (on: boolean) => { setPage(1); setRoleFilter(on ? new Set(ROLES) : new Set()); };
  // Page-scroll sticky header: the page (<main>) scrolls vertically while the table keeps its own
  // horizontal scroll. We translate the <thead> down by the page's scrollTop to keep it pinned.
  const theadRef = useRef<HTMLTableSectionElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  function load() { setReloadKey((k) => k + 1); }
  useEffect(() => {
    const ac = new AbortController();
    const p = new URLSearchParams({ page: String(page), per: String(per) });
    if (dq) p.set("q", dq);
    // Only send `roles` when it actually narrows (some unchecked); all-checked = show every role.
    if (roleFilter.size < ROLES.length) p.set("roles", [...roleFilter].join(","));
    else if (applied.role) p.set("role", applied.role);
    if (applied.managerId) p.set("managerId", applied.managerId);
    if (applied.status) p.set("status", applied.status);
    if (applied.live) p.set("live", applied.live);
    if (sort.sort && sort.dir) { p.set("sort", sort.sort); p.set("dir", sort.dir); }
    api.get(`/users?${p}`, { signal: ac.signal }).then((r) => { setData(r); setErr(null); }).catch((e) => { if (!isAbort(e)) setErr(e.message); });
    return () => ac.abort();
  }, [dq, applied, roleFilter, page, per, reloadKey, sort.sort, sort.dir]);

  // Pin the header to the PAGE during vertical scroll (table keeps its own horizontal scroll).
  useEffect(() => {
    const scroller = wrapRef.current?.closest("main") as HTMLElement | null;
    const thead = theadRef.current;
    if (!scroller || !thead) return;
    const onScroll = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const y = scroller.scrollTop - wrap.offsetTop;
      const maxShift = wrap.clientHeight - thead.offsetHeight;
      thead.style.transform = `translateY(${Math.max(0, Math.min(y, maxShift))}px)`;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => { scroller.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [data]);

  const activeCount = Object.values(applied).filter(Boolean).length;
  function openDrawer() { setDraft(applied); setDrawer(true); }
  function applyFilters() { setApplied(draft); setPage(1); setDrawer(false); }
  function clearAll() { setApplied(EMPTY_FILTERS); setDraft(EMPTY_FILTERS); setPage(1); }

  async function remove(u: any) {
    if (!(await confirm({ title: "Delete user?", message: `Delete ${u.name}? This cannot be undone.` }))) return;
    try { await api.del(`/users/${u.id}`); toast.success("User deleted."); load(); } catch (e: any) { toast.error(e.message); }
  }
  async function sendInvite(u: any) {
    try { const r = await api.post(`/users/${u.id}/invite`); setInvite({ link: r.link, email: r.email, delivered: r.delivered }); } catch (e: any) { toast.error(e.message); }
  }
  async function bulkInvite(scope: "pending" | "all") {
    if (!(await confirm({ title: "Send invites?", message: `Send set-password invites to ${scope === "all" ? "all active users" : "users who haven't set a password"}?`, confirmText: "Send", danger: false }))) return;
    setBusy(true);
    try { const r = await api.post(`/users/invite/bulk`, { scope }); setMsg({ text: `Invited ${r.count} user(s), ${r.delivered} email(s) delivered.`, ok: true }); } catch (e: any) { setMsg({ text: e.message, ok: false }); } finally { setBusy(false); }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;

  return (
    <div className="flex flex-col space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Users <span className="text-base font-medium text-slate-400">· {data?.total ?? "…"}</span></h1>
          {/* Roles quick-filter — same checkbox-dropdown pattern as the Instructor Master "Departments". */}
          <span className="relative">
            <button onClick={() => setRoleOpen((o) => !o)} className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
              Roles ({roleFilter.size}/{ROLES.length})
            </button>
            {roleOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setRoleOpen(false)} />
                <div className="absolute left-0 top-7 z-40 w-[260px] rounded-xl border border-slate-200 bg-white p-2 shadow-soft">
                  <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                    <span className="font-semibold text-slate-600">Show roles</span>
                    <span className="flex gap-3">
                      <button onClick={() => setAllRoles(true)} className="font-medium text-brand-600 hover:underline">All</button>
                      <button onClick={() => setAllRoles(false)} className="font-medium text-slate-500 hover:underline">None</button>
                    </span>
                  </div>
                  {ROLES.map((r) => (
                    <label key={r} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                      <input type="checkbox" checked={roleFilter.has(r)} onChange={() => toggleRole(r)} className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300" />
                      <span>{ROLE_LABEL[r] || r}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input h-9 pl-9 text-sm" placeholder="Name or email…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          </div>
          <button onClick={openDrawer} className="btn btn-ghost btn-sm shrink-0">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeCount > 0 && <span className="ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeCount}</span>}
          </button>
          {activeCount > 0 && <button onClick={clearAll} className="text-sm font-medium text-rose-600 hover:text-rose-700">Clear filters</button>}
          <button disabled={busy} onClick={() => bulkInvite("pending")} className="btn btn-ghost btn-sm"><Mail className="h-4 w-4" /> Invite pending</button>
          <button onClick={() => setEditing({})} className="btn btn-primary btn-sm"><Plus className="h-4 w-4" /> Add user</button>
        </div>
      </div>

      {msg && <div className={`card px-4 py-2 text-sm ${msg.ok ? "border-brand-200 bg-brand-50 text-brand-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
      {err && <div className="card flex items-center justify-between p-4 text-sm text-rose-600"><span>{err}</span><button onClick={load} className="btn btn-ghost btn-sm">Retry</button></div>}

      <div className="card overflow-hidden">
        <div ref={wrapRef} className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead ref={theadRef} className="relative z-20 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 [&_th]:bg-slate-50">
              <tr>
                <SortHeader label="Name" k="name" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Email" k="email" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <SortHeader label="Role" k="role" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <th className="px-5 py-3">Reports to</th>
                <th className="px-5 py-3">Status</th>
                <SortHeader label="Last login" k="lastLoginAt" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <th className="px-5 py-3">Live</th>
                <SortHeader label="Last seen" k="lastSeenAt" state={sort} onToggle={sort.toggle} className="px-5 py-3" />
                <th className="sticky right-0 z-30 border-l border-slate-100 bg-slate-50 px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data && <SkeletonRows rows={12} cols={9} />}
              {data?.users.map((u: any) => (
                <tr key={u.id} className="group hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium cell-trunc" title={u.name}>{u.name}</td>
                  <td className="px-5 py-3 text-slate-500 cell-trunc" title={u.email}>{u.email}</td>
                  <td className="px-5 py-3"><span className="chip chip-gray">{ROLE_LABEL[u.role]}</span></td>
                  <td className="px-5 py-3 text-slate-500 cell-trunc" title={u.managerName || "—"}>{u.managerName || "—"}</td>
                  <td className="px-5 py-3">{u.active ? (u.mustSetPassword ? <span className="chip chip-necessary">Pending password</span> : <span className="chip chip-public">Active</span>) : <span className="chip chip-sensitive">Inactive</span>}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">{fmtDateTime(u.lastLoginAt)}</td>
                  <td className="px-5 py-3">
                    {u.online
                      ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span> Live</span>
                      : <span className="inline-flex items-center gap-1.5 text-sm text-slate-400"><span className="h-2 w-2 rounded-full bg-slate-300" /> Offline</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">{fmtRelative(u.lastSeenAt)}</td>
                  <td className="sticky right-0 z-10 border-l border-slate-100 bg-white px-5 py-3 group-hover:bg-slate-50">
                    <div className="flex justify-end">
                      <RowActionsMenu actions={[
                        { label: "Send invite", icon: Mail, onClick: () => sendInvite(u) },
                        { label: "Edit", icon: Pencil, onClick: () => setEditing(u) },
                        { label: "Delete", icon: Trash2, danger: true, onClick: () => remove(u) },
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
              {data && !data.users.length && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">No users match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {data && <Pagination page={page} pages={pages} per={per} total={data.total} onPage={setPage} onPer={(n) => { setPer(n); setPage(1); }} />}

      {editing && <UserModal user={editing} seniors={data?.seniors || []} onClose={() => setEditing(null)} onSaved={(inv: any) => { setEditing(null); load(); if (inv?.inviteLink) setInvite({ link: inv.inviteLink, email: inv.email, delivered: inv.emailed }); }} />}
      {invite && (
        <Modal title="Set-password invite" onClose={() => setInvite(null)}>
          <p className="text-sm text-slate-600">{invite.delivered ? `An email was sent to ${invite.email}.` : `Could not email automatically — share this link with the user:`}</p>
          <div className="mt-3 flex gap-2">
            <input readOnly className="input font-mono text-xs" value={invite.link} onFocus={(e) => e.target.select()} />
            <button onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(invite.link).then(() => toast.success("Link copied.")).catch(() => toast.error("Couldn't copy — select and copy manually.")); else toast.error("Copy not available — select and copy manually."); }} className="btn btn-ghost btn-sm shrink-0"><Copy className="h-4 w-4" /></button>
          </div>
        </Modal>
      )}

      {/* Right-side filter drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setDrawer(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Filters</h2>
              <button onClick={() => setDrawer(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div>
                <label className="label">Role</label>
                <ScrollSelect value={draft.role} onChange={(v) => setDraft({ ...draft, role: v })} placeholder="All roles"
                  options={[{ value: "", label: "All roles" }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))]} />
              </div>
              <div>
                <label className="label">Reports to</label>
                <ScrollSelect value={draft.managerId} onChange={(v) => setDraft({ ...draft, managerId: v })} placeholder="Anyone"
                  options={[{ value: "", label: "Anyone" }, ...(data?.managers || []).map((m: any) => ({ value: m.id, label: `${m.name} (${ROLE_LABEL[m.role] || m.role})` }))]} />
              </div>
              <div>
                <label className="label">Status</label>
                <ScrollSelect value={draft.status} onChange={(v) => setDraft({ ...draft, status: v })} placeholder="All statuses"
                  options={[{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "pending", label: "Pending password" }, { value: "inactive", label: "Inactive" }]} />
              </div>
              <div>
                <label className="label">Live</label>
                <ScrollSelect value={draft.live} onChange={(v) => setDraft({ ...draft, live: v })} placeholder="Anyone"
                  options={[{ value: "", label: "Anyone" }, { value: "live", label: "Live (online now)" }, { value: "offline", label: "Offline" }]} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4">
              <button onClick={() => setDraft(EMPTY_FILTERS)} className="btn btn-ghost btn-sm">Clear all</button>
              <button onClick={applyFilters} className="btn btn-primary btn-sm">Apply filters</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserModal({ user, seniors, onClose, onSaved }: { user: any; seniors: any[]; onClose: () => void; onSaved: (inv: any) => void }) {
  const isNew = !user.id;
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [role, setRole] = useState(user.role || "INSTRUCTOR");
  const [managerId, setManagerId] = useState(user.managerId || "");
  const [active, setActive] = useState(user.active ?? true);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setErr(null);
    try {
      if (isNew) {
        const r = await api.post(`/users`, { name, email, role, managerId: managerId || null, password: password || undefined });
        onSaved(r);
      } else {
        await api.patch(`/users/${user.id}`, { name, email, role, managerId: managerId || null, active, newPassword: password || undefined });
        onSaved(null);
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? "Add user" : "Edit user"} onClose={onClose}>
      <div className="space-y-3">
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{err}</div>}
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Role</label>
          <select className="input" value={role} onChange={(e) => { setRole(e.target.value); if (e.target.value !== "CAPABILITY_MANAGER") setManagerId(""); }}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </div>
        {role === "CAPABILITY_MANAGER" && (
          <div><label className="label">Reports to (Senior Manager)</label>
            <ScrollSelect value={managerId} placeholder="— select —" onChange={setManagerId}
              options={[{ value: "", label: "— select —" }, ...seniors.map((s: any) => ({ value: s.id, label: s.name }))]} />
          </div>
        )}
        {!isNew && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>}
        <div><label className="label">{isNew ? "Password (optional — emails a set-password link if blank)" : "New password (leave blank to keep)"}</label><input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn btn-ghost btn-sm">Cancel</button>
          <button disabled={busy} onClick={save} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
