import { useCallback, useEffect, useState, type RefObject } from "react";
import { api } from "./api";

// Pin a table's <thead> to the top while the PAGE (<main>) scrolls vertically and the table scrolls
// horizontally. CSS `position: sticky` can't pin through the overflow-x wrapper, so we translate the
// <thead> down by the scroller's scrollTop. Built to stay SMOOTH on large pages (500–1000 rows):
//   • measure geometry (offsetTop / heights) ONCE — and on resize / `deps` change — never per scroll frame,
//     so we never trigger a synchronous reflow while scrolling;
//   • on scroll, only read the cheap scrollTop and write the transform inside requestAnimationFrame,
//     coalescing event bursts to one paint per frame;
//   • use translate3d + will-change so the header rides its own GPU/compositor layer.
// Pass `deps` that change when the row set / layout changes (e.g. [meta, rows.length]) to re-measure.
export function useStickyThead(
  wrapRef: RefObject<HTMLElement | null>,
  theadRef: RefObject<HTMLTableSectionElement | null>,
  deps: readonly unknown[] = [],
) {
  useEffect(() => {
    const scroller = wrapRef.current?.closest("main") as HTMLElement | null;
    const thead = theadRef.current;
    if (!scroller || !thead) return;

    let wrapTop = 0, maxShift = 0, ticking = false, lastY = -1;
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      wrapTop = wrap.offsetTop;
      maxShift = wrap.clientHeight - thead.offsetHeight; // don't let the header slide past the table
    };
    const apply = () => {
      ticking = false;
      const y = Math.max(0, Math.min(scroller.scrollTop - wrapTop, maxShift));
      if (y === lastY) return; // skip redundant style writes
      lastY = y;
      thead.style.transform = `translate3d(0, ${y}px, 0)`;
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } };
    const onResize = () => { measure(); apply(); };

    measure();
    thead.style.willChange = "transform";
    apply();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      thead.style.willChange = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

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
