import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

// Stale-while-revalidate GET cache: revisiting a page shows cached data INSTANTLY,
// then refreshes in the background. Cleared on logout (see auth.tsx).
const _cache = new Map<string, any>();
export function clearGetCache() { _cache.clear(); }

export function useCachedGet<T = any>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? _cache.get(path) : undefined));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !(path && _cache.has(path)));

  const fetchInto = useCallback((p: string, signal?: AbortSignal) => {
    return api.get<T>(p, signal ? { signal } : undefined)
      .then((r) => { _cache.set(p, r); setData(r); setError(null); })
      .catch((e) => { if (!isAbort(e)) setError(e.message || "Failed to load"); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!path) return;
    const cached = _cache.get(path);
    if (cached !== undefined) { setData(cached); setLoading(false); } else setLoading(true);
    const ac = new AbortController();
    fetchInto(path, ac.signal); // revalidate in the background
    return () => ac.abort();
  }, [path, fetchInto]);

  // Optimistic local update that also writes through to the cache.
  const update = useCallback((updater: T | ((prev: T) => T)) => {
    setData((prev: any) => { const next = typeof updater === "function" ? (updater as any)(prev) : updater; if (path) _cache.set(path, next); return next; });
  }, [path]);
  const reload = useCallback(() => { if (path) return fetchInto(path); }, [path, fetchInto]);

  return { data, setData: update, loading, error, reload };
}

// Debounce a rapidly-changing value (e.g. a search box) so effects fire less often.
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// True if an error is a fetch abort (from an AbortController) — safe to ignore.
export function isAbort(e: any): boolean {
  return e?.name === "AbortError" || e?.code === 20;
}
