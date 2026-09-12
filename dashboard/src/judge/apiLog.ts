import { useSyncExternalStore } from 'react';

export interface ApiLogEntry {
  id: number;
  ts: number;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  error?: string;
  fellBackToMock: boolean;
}

const MAX_ENTRIES = 50;
// Only endpoint in apiClient with no local mock fallback
const NO_FALLBACK_PATHS = ['/api/twin/import'];

let entries: ApiLogEntry[] = [];
let nextId = 1;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function push(entry: ApiLogEntry) {
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

export function clearApiLog() {
  entries = [];
  emit();
}

export function useApiLog(): ApiLogEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entries,
  );
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function toPath(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

/**
 * Wraps window.fetch once and records every /api call (except the health poll).
 * Every apiClient method throws on !res.ok and returns a mock in its catch, so
 * "fell back to mock" is exactly (threw || !ok) for all endpoints with a fallback.
 */
export function installFetchLogger() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = toUrlString(input);
    const path = toPath(url);
    const shouldLog = path.startsWith('/api') && !path.endsWith('/health');
    if (!shouldLog) return originalFetch(input, init);

    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const hasFallback = !NO_FALLBACK_PATHS.includes(path);
    const started = performance.now();

    try {
      const res = await originalFetch(input, init);
      push({
        id: nextId++,
        ts: Date.now(),
        method,
        url: path,
        status: res.status,
        ok: res.ok,
        durationMs: Math.round(performance.now() - started),
        error: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`.trim(),
        fellBackToMock: hasFallback && !res.ok,
      });
      return res;
    } catch (e: any) {
      push({
        id: nextId++,
        ts: Date.now(),
        method,
        url: path,
        status: null,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        error: e?.message || String(e),
        fellBackToMock: hasFallback,
      });
      throw e;
    }
  };
}
