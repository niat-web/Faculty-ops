import { Loader2 } from "lucide-react";

// Centered loading animation used while a page/section fetches its data.
export default function Loading({ label = "Loading…", full = false, compact = false }: { label?: string; full?: boolean; compact?: boolean }) {
  const h = full ? "min-h-screen" : compact ? "min-h-[180px]" : "min-h-[60vh]";
  return (
    <div className={`flex w-full flex-col items-center justify-center gap-3 text-slate-400 ${h}`}>
      <Loader2 className={`${compact ? "h-7 w-7" : "h-9 w-9"} animate-spin text-brand-600`} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
