/** Banner when background refresh failed but cached data is shown. */
export default function StaleDataBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>Showing cached data — {message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-semibold text-brand-700 hover:underline">Retry</button>}
    </div>
  );
}
