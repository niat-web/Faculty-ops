import { progress } from "./progress";

// Thin fetch wrapper — always sends the session cookie, throws on non-2xx.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

// In dev, leave VITE_API_URL blank so the Vite proxy handles /api → :4000.
// In production (Vercel), set VITE_API_URL to the Northflank backend origin.
export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  progress.start();
  try {
    const res = await fetch(`${API_BASE}/api${path}`, {
      credentials: "include",
      headers: opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      ...opts,
    });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) throw new ApiError((data && (data as any).error) || res.statusText, res.status);
    return data as T;
  } finally {
    progress.done();
  }
}

export const api = {
  get: <T = any>(p: string, opts?: { signal?: AbortSignal }) => request<T>(p, opts),
  post: <T = any>(p: string, body?: any) => request<T>(p, { method: "POST", body: body != null ? JSON.stringify(body) : undefined }),
  patch: <T = any>(p: string, body?: any) => request<T>(p, { method: "PATCH", body: body != null ? JSON.stringify(body) : undefined }),
  del: <T = any>(p: string) => request<T>(p, { method: "DELETE" }),
  upload: <T = any>(p: string, form: FormData) => request<T>(p, { method: "POST", body: form }),
};
