import { useState } from "react";
import { Layers, Send, X, Loader2 } from "lucide-react";
import { useBatchEdit } from "../batchEdit";
import { useToast } from "../toast";
import { useConfirm } from "../confirm";
import Modal from "./Modal";

/**
 * Floating bar shown whenever batch-edit mode is active (CM/SM multi-select flow).
 * Sits above all pages; lets the requester review the count and submit ALL buffered
 * field edits as one change request to the Ops Admin.
 */
export default function BatchEditBar() {
  const { active, count, items, submit, cancel } = useBatchEdit();
  const toast = useToast();
  const confirm = useConfirm();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ count: number; instructors: number } | null>(null);

  if (!active && !banner) return null;

  const instructorCount = new Set(items.map((i) => i.instructorId)).size;

  async function doSubmit() {
    setBusy(true);
    try {
      const r = await submit(reason.trim());
      setReasonOpen(false);
      setReason("");
      setBanner({ count: r.count, instructors: r.instructors }); // success banner (top-right)
      setTimeout(() => setBanner(null), 8000);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit changes");
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    if (count > 0 && !(await confirm({ title: "Discard changes?", message: `Discard ${count} unsaved change(s)? They won't be submitted.`, confirmText: "Discard", danger: true }))) return;
    cancel();
  }

  return (
    <>
      {/* Bottom-centre action bar */}
      {active && (
        <div className="fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-2.5 shadow-2xl ring-1 ring-brand-100">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <Layers className="h-4 w-4 text-brand-600" />
              Batch edit
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{count}</span>
              {count > 0 && <span className="text-xs font-normal text-slate-400">across {instructorCount} instructor{instructorCount > 1 ? "s" : ""}</span>}
            </span>
            <button onClick={() => setReasonOpen(true)} disabled={count === 0} className="btn btn-primary btn-sm disabled:opacity-40"><Send className="h-4 w-4" /> Submit changes</button>
            <button onClick={doCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600" title="Discard & exit batch edit"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Top-right success banner after submission */}
      {banner && (
        <div className="fixed right-5 top-5 z-[70] max-w-sm rounded-xl border border-emerald-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Send className="h-4 w-4" /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">Submission requested to Ops Admin</p>
              <p className="mt-0.5 text-xs text-slate-500">{banner.count} change(s) across {banner.instructors} instructor(s) sent for approval. Once verified, you'll receive an email.</p>
            </div>
            <button onClick={() => setBanner(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Reason prompt before submit */}
      {reasonOpen && (
        <Modal title="Submit changes for approval" onClose={() => !busy && setReasonOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{count} change(s) across {instructorCount} instructor(s) will be sent to an Ops Admin for approval.</p>
            <div>
              <label className="label">Reason / note (sent to the approver)</label>
              <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why these changes?" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setReasonOpen(false)} disabled={busy} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={doSubmit} disabled={busy} className="btn btn-primary btn-sm disabled:opacity-50">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <>Submit {count} change(s)</>}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
