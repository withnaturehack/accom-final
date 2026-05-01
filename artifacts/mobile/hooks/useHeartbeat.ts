import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { useApiRequest, useAuth } from "@/context/AuthContext";

const HEARTBEAT_MS = 2 * 60 * 1000; // ping every 2 minutes
const STAFF_ROLES = new Set(["volunteer", "coordinator", "admin", "superadmin"]);

export function useHeartbeat() {
  const { user, token } = useAuth();
  const request = useApiRequest();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const mountedRef = useRef(true);

  const isStaff = STAFF_ROLES.has(user?.role ?? "");

  const beat = useCallback(async () => {
    if (!token || !mountedRef.current) return;
    try {
      await request("/staff/heartbeat", { method: "POST" });
    } catch {
    }
  }, [token, request]);

  const start = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    beat();
    timerRef.current = setInterval(beat, HEARTBEAT_MS);
  }, [beat]);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isStaff || !token) {
      stop();
      return;
    }

    start();

    const handleAppState = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (Platform.OS === "web") return;

      if (prev.match(/inactive|background/) && next === "active") {
        start();
      } else if (next.match(/inactive|background/)) {
        stop();
      }
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => {
      stop();
      sub.remove();
    };
  }, [isStaff, token, start, stop]);
}
