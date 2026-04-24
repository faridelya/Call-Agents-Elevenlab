'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { auth as authApi, tokenStore, refreshStore, type UserProfile } from '@/lib/api';

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    await authApi.logout();
    tokenStore.clear();
    refreshStore.clear();
    setUser(null);
  }, []);

  // On mount: try to restore session from refresh token
  useEffect(() => {
    const restore = async () => {
      const rt = refreshStore.get();
      if (!rt) { setIsLoading(false); return; }

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!res.ok) { refreshStore.clear(); setIsLoading(false); return; }
        const data = await res.json();
        tokenStore.set(data.access_token);
        if (data.refresh_token) refreshStore.set(data.refresh_token);
        const profile = await authApi.me();
        setUser(profile);
      } catch {
        refreshStore.clear();
      } finally {
        setIsLoading(false);
      }
    };

    restore();

    // Listen for forced logout events (401 refresh failure)
    const handleForceLogout = () => { setUser(null); };
    window.addEventListener('voxara:logout', handleForceLogout);
    return () => window.removeEventListener('voxara:logout', handleForceLogout);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    tokenStore.set(data.access_token);
    refreshStore.set(data.refresh_token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, full_name: string) => {
    const data = await authApi.register(email, password, full_name);
    tokenStore.set(data.access_token);
    refreshStore.set(data.refresh_token);
    setUser(data.user);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
