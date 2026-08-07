"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  type AuthUser,
  getSession,
  login as storeLogin,
  logout as storeLogout,
  register as storeRegister,
} from "@/lib/auth-store";

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => AuthUser | null;
  logout: () => void;
  register: (name: string, email: string, password: string) => AuthUser | null;
}

const Ctx = createContext<AuthCtx>({
  user: null, loading: true,
  login: () => null, logout: () => {}, register: () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getSession());
    setLoading(false);
  }, []);

  const login = (email: string, password: string) => {
    const u = storeLogin(email, password);
    setUser(u);
    return u;
  };
  const logout = () => { storeLogout(); setUser(null); };
  const register = (name: string, email: string, password: string) => {
    const u = storeRegister(name, email, password);
    setUser(u);
    return u;
  };

  return (
    <Ctx.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
