"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { LAST_SYNC_KEY, syncNow } from "@/lib/sync";

type SyncStatus = "idle" | "syncing" | "synced" | "error";

interface SyncState {
  online: boolean;
  status: SyncStatus;
  lastSync: string | null;
  error: string | null;
  songCount: number | null;
  refresh: () => void;
}

const SyncContext = createContext<SyncState>({
  online: true,
  status: "idle",
  lastSync: null,
  error: null,
  songCount: null,
  refresh: () => {},
});

export function useSync(): SyncState {
  return useContext(SyncContext);
}

export default function SyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [songCount, setSongCount] = useState<number | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    setStatus("syncing");
    setError(null);
    const result = await syncNow();
    running.current = false;
    if (result.ok) {
      setStatus("synced");
      setSongCount(result.count);
      setLastSync(new Date().toISOString());
    } else if (result.unauthorized) {
      window.location.href =
        "/auth/login?returnTo=" + encodeURIComponent(window.location.pathname);
    } else {
      setStatus("error");
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    try {
      setLastSync(localStorage.getItem(LAST_SYNC_KEY));
    } catch {}
    if (navigator.onLine) refresh();

    const goOnline = () => {
      setOnline(true);
      refresh();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [refresh]);

  return (
    <SyncContext.Provider
      value={{ online, status, lastSync, error, songCount, refresh }}
    >
      {children}
    </SyncContext.Provider>
  );
}
