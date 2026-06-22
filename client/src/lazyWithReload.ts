import { lazy, type ComponentType } from "react";

const KEY = "chunk-reload-at";
// True if this looks like a stale-chunk / failed dynamic-import error (after a redeploy).
export function isChunkError(err: any): boolean {
  const m = String(err?.message || err || "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|chunk/i.test(m);
}
// Reload at most once per 10s so a genuine (non-chunk) error can't loop forever.
export function reloadOnce(): boolean {
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
    return true;
  }
  return false;
}

// Drop-in for React.lazy that silently hard-reloads once when a chunk fails to load
// (the classic "stale chunk after deploy" case) instead of surfacing the error boundary.
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkError(err) && reloadOnce()) return await new Promise<{ default: T }>(() => {});
      throw err;
    }
  });
}
