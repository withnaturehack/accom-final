import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";

// Production URL — always used when no explicit override is set.
// app.config.js also ensures this is the default, but we keep it here as a
// bulletproof final fallback so that Expo Go / APK builds never hit localhost.
const PROD_API = "https://zip-12--vpahaddevbhoomi.replit.app/api";

const API_BASE: string =
  (process.env.EXPO_PUBLIC_API_URL) ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  PROD_API;

// ─── Types ────────────────────────────────────────────────────────────────────
export type UserRole =
  | "student" | "volunteer" | "coordinator"
  | "admin" | "superadmin" | "pending";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  rollNumber?: string;
  phone?: string;
  contactNumber?: string;
  mobileNumber?: string;
  area?: string;
  hostelId?: string;
  hostelName?: string;
  roomNumber?: string;
  assignedMess?: string;
  attendanceStatus?: string;
  isActive?: boolean;
  lastActiveAt?: string;
  assignedHostelIds?: string;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, rollNumber: string) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isCoordinator: boolean;
  isVolunteer: boolean;
  isSuperAdmin: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Network helpers ──────────────────────────────────────────────────────────
function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|::1/.test(url);
}

function resolvedBase(): string {
  if (isLocalhostUrl(API_BASE) && Platform.OS !== "web") {
    // Guard: if somehow localhost slipped in for a real device, use prod.
    return PROD_API;
  }
  return API_BASE;
}

async function safeJsonFetch(url: string, opts: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      throw new Error("Request timed out. Check your connection.");
    }
    // Network-level error (no wifi, airplane mode, etc.)
    throw new Error("Network error. Make sure you're connected to the internet.");
  }
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw new Error("Unexpected server response. Please try again."); }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, isLoading: true });
  const base = resolvedBase();

  useEffect(() => { loadStoredAuth(); }, []);

  async function loadStoredAuth() {
    try {
      const token = await AsyncStorage.getItem("token");
      if (token) {
        const user = await fetchMe(token);
        if (user) {
          setState({ user, token, isLoading: false });
          return;
        }
        // Token invalid — clear it
        await AsyncStorage.removeItem("token").catch(() => {});
      }
    } catch {}
    setState(s => ({ ...s, isLoading: false }));
  }

  async function fetchMe(token: string): Promise<User | null> {
    try {
      const res = await safeJsonFetch(`${base}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 10000);
      if (!res.ok) return null;
      const data = await parseJson(res);
      return data?.id ? data : null;
    } catch { return null; }
  }

  async function login(email: string, password: string) {
    const res = await safeJsonFetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data?.message || "Login failed. Check your credentials.");

    const token: string = data.token;
    if (!token) throw new Error("Login failed. No session token returned.");

    await AsyncStorage.setItem("token", token);
    const me = await fetchMe(token);
    setState({ user: me || data.user, token, isLoading: false });
  }

  async function register(
    name: string, email: string, password: string, rollNumber: string
  ): Promise<string> {
    const res = await safeJsonFetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: email.trim().toLowerCase(), password, rollNumber }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data?.message || "Registration failed. Please try again.");
    return data.message || "Registration submitted. Awaiting Super Admin approval.";
  }

  async function logout() {
    const tokenToClear = state.token;

    // Ask server to record logout before local token removal.
    if (tokenToClear) {
      try {
        await safeJsonFetch(`${base}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenToClear}`,
          },
        }, 10000);
      } catch {}
    }

    // Clear in-memory auth first so UI immediately transitions to auth screen.
    setState({ user: null, token: null, isLoading: false });
    await AsyncStorage.multiRemove(["token"]).catch(() => {});
  }

  async function refreshUser() {
    if (!state.token) return;
    try {
      const user = await fetchMe(state.token);
      if (user) setState(s => ({ ...s, user }));
    } catch {}
  }

  const role = state.user?.role;
  const isCoordinator = role === "coordinator" || role === "admin" || role === "superadmin";
  const isVolunteer   = role === "volunteer" || isCoordinator;
  const isSuperAdmin  = role === "superadmin";
  const isStudent     = role === "student";

  return (
    <AuthContext.Provider value={{
      ...state,
      login, register, logout, refreshUser,
      isCoordinator, isVolunteer, isSuperAdmin, isStudent,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useApiRequest() {
  const { token } = useAuth();
  const base = resolvedBase();

  return useCallback(async (path: string, options: RequestInit = {}) => {
    const res = await safeJsonFetch(`${base}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    }, 15000);

    const data = await parseJson(res);
    if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
    return data;
  }, [token, base]);
}
