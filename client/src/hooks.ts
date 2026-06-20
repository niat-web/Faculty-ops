import { useEffect, useState } from "react";

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
