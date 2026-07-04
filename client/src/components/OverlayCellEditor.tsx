// Shared zero-CLS inline text editor (Google Sheets / Airtable behavior), used by BOTH the Instructor
// Master and Instructor Stats grids so the editing experience is identical everywhere.
//
// How it stays zero-layout-shift: an invisible one-line "sizer" holds the cell's EXACT width + height so
// the column never widens and the row never grows; the real <textarea> is an absolute overlay that wraps
// and auto-grows DOWNWARD over the rows below. Esc cancels, click-away (blur) saves.
export default function OverlayCellEditor({
  value, onCommit, onCancel, dense, sizerClass, onRef,
}: {
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
  dense?: boolean;                                  // Stats grid density (11px / px-1.5) vs Master (14px / px-2)
  sizerClass?: string;                              // extra classes on the invisible sizer (e.g. max-w / alignment)
  onRef?: (el: HTMLTextAreaElement | null) => void; // let the caller capture the node (e.g. Stats' editRef)
}) {
  // The invisible SIZER matches the host grid's density (dense = 11px / px-1.5) so the cell keeps its exact
  // size → zero CLS. The visible OVERLAY textarea is constrained to the CELL WIDTH (w-full, min-w-0, no
  // min/max width) so it never overflows into adjacent columns; long unbreakable words wrap in-cell
  // (break-words) and the editor auto-grows DOWNWARD only. Width never depends on the text length.
  const sizerPad = dense ? "px-1.5 py-1 text-[11px]" : "px-2 py-1 text-sm";
  return (
    <div className={`relative w-full min-w-0 ${dense ? "min-h-[36px]" : ""}`}>
      <span aria-hidden className={`block truncate leading-snug invisible ${sizerPad} ${sizerClass || ""}`}>{value || "—"}</span>
      <textarea
        autoFocus
        rows={1}
        defaultValue={value}
        ref={(el) => { onRef?.(el); if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; el.setSelectionRange(el.value.length, el.value.length); } }}
        className="absolute left-0 top-0 z-20 block w-full min-w-0 resize-none overflow-hidden break-words rounded border border-brand-400 bg-white px-2 py-1 text-left text-sm leading-snug shadow-lg outline-none ring-2 ring-brand-100"
        onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = `${t.scrollHeight}px`; }}
        onBlur={(e) => onCommit(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      />
    </div>
  );
}
