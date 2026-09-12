import { useCallback, useEffect, useRef, useState } from 'react';

export interface BackendHealth {
  /** null = not checked yet */
  isLive: boolean | null;
  lastCheckedAt: number | null;
  recheck: () => void;
}

/** Polls /api/health so the status pill tracks the backend coming up or down while debugging. */
export function useBackendHealth(intervalMs = 10000): BackendHealth {
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' });
      setIsLive(res.ok);
    } catch {
      setIsLive(false);
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setLastCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [check, intervalMs]);

  return { isLive, lastCheckedAt, recheck: check };
}
