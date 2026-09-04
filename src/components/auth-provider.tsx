"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, useTransition, type ReactNode } from "react";
import { logoutAction } from "@/lib/auth/actions";

/** Minimal, non-sensitive view of the signed-in user for client components (header, menus). */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  isSeller: boolean;
  sellerStatus: string | null;
  isAdmin: boolean;
  impersonatedBy: string | null;
  unreadNotifications: number;
};

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>({ user: null, loading: true, refresh: async () => {}, logout: () => {} });

/**
 * Session state for client components. The source of truth is the httpOnly
 * session cookie on the server; this provider only mirrors a safe DTO from
 * /api/auth/session so public pages can stay cacheable.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      const data = (await res.json()) as { user: SessionUser | null };
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the initial session fetch doesn't set state synchronously inside the effect body.
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh]);

  const logout = useCallback(() => {
    setUser(null);
    startTransition(async () => {
      await logoutAction();
      router.push("/");
      router.refresh();
    });
  }, [router]);

  return <Ctx.Provider value={{ user, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
