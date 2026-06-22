// Invisible spacer that just holds layout height while data loads. There are no in-page
// spinners anymore — the global TopProgressBar (top of the screen) is the only loading indicator.
export default function Loading({ full = false, compact = false }: { label?: string; full?: boolean; compact?: boolean }) {
  const h = full ? "min-h-screen" : compact ? "min-h-[180px]" : "min-h-[60vh]";
  return <div className={`w-full ${h}`} aria-busy="true" />;
}
