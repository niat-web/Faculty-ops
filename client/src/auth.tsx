import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface SessionUser { id: string; email: string; name: string; role: string; managerId?: string | null; }

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string, token?: string) => Promise<{ twoFactorRequired?: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try { const r = await api.get<{ user: SessionUser | null }>("/auth/me"); setUser(r.user); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  async function login(email: string, password: string, token?: string) {
    const r = await api.post<{ user?: SessionUser; twoFactorRequired?: boolean }>("/auth/login", { email, password, token });
    if (r.twoFactorRequired && !r.user) return { twoFactorRequired: true };
    if (r.user) setUser(r.user);
    return {};
  }
  async function logout() { await api.post("/auth/logout"); setUser(null); }

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const ROLE_LABEL: Record<string, string> = {
  OPS_ADMIN: "Ops Admin", SENIOR_MANAGER: "Senior Manager", CAPABILITY_MANAGER: "Capability Manager", INSTRUCTOR: "Instructor",
};
export const LIFECYCLE_LABEL: Record<string, string> = {
  ONBOARDING: "Onboarding", IN_TRAINING: "In Training", CONFIRMED: "Confirmed", TRANSFER: "Transfer",
  EXIT_IN_PROGRESS: "Exit in Progress", EXITED: "Exited", REHIRED: "Rehired",
};
