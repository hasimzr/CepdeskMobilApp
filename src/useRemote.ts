import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { client } from './client';
import { RemoteEntry } from './remote-cache';
import { useCanvasActivity } from './CanvasActivity';
type Shared = { entry: RemoteEntry; method: string; events: Set<string>; users: number; live: number; timer: ReturnType<typeof setInterval> | null; refreshTimer: ReturnType<typeof setTimeout> | null };
const entries = new Map<string, Shared>();
let initialized = false; let identity = '';
function initialize() {
  if (initialized) return; initialized = true; identity = client.state === 'connected' ? client.info?.server_id ?? '' : '';
  client.subscribe(() => {
    const next = client.state === 'connected' ? client.info?.server_id ?? '' : '';
    if (next === identity) return; identity = next;
    for (const shared of entries.values()) { shared.entry.clear(); if (next && shared.users) void shared.entry.refresh(); }
  });
  client.onEvent(event => {
    for (const shared of entries.values()) {
      if (!shared.live || (!shared.events.has(event.event) && event.event !== 'resync.required') || shared.refreshTimer) continue;
      shared.refreshTimer = setTimeout(() => { shared.refreshTimer = null; if (client.state === 'connected') void shared.entry.refresh(); }, 140);
    }
  });
}
export function useRemote<T>(method: string, params: object, eventNames: string[], poll = 0) {
  const live = useCanvasActivity(); initialize();
  const key = `${method}:${JSON.stringify(params)}`;
  const shared = useMemo(() => {
    let item = entries.get(key);
    if (!item) {
      const parsed = JSON.parse(key.slice(method.length + 1));
      const entry = new RemoteEntry(async () => {
        if (client.state !== 'connected') throw new Error('Bilgisayar bağlı değil.');
        if (method === 'jobs.get' && !parsed.id) return null;
        if (method === 'applications.list') {
          const applications: unknown[] = [];
          while (applications.length < 8192) {
            const page = await client.request<{ applications: unknown[]; has_more: boolean }>(method, { offset: applications.length });
            applications.push(...page.applications); if (!page.has_more || !page.applications.length) break;
          }
          return { applications };
        }
        return client.request(method, parsed);
      });
      item = { entry, method, events: new Set(), users: 0, live: 0, timer: null, refreshTimer: null }; entries.set(key, item);
    }
    eventNames.forEach(event => item!.events.add(event));
    return item;
    // Params and events are compared by their serialized keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, method]);
  const snapshot = useSyncExternalStore(listener => { shared.entry.listeners.add(listener); return () => { shared.entry.listeners.delete(listener); }; }, () => shared.entry.snapshot);
  useEffect(() => {
    shared.users++; if (live) shared.live++;
    if (live && !shared.entry.snapshot.data && client.state === 'connected') void shared.entry.refresh();
    if (poll && !shared.timer) shared.timer = setInterval(() => { if (shared.live && client.state === 'connected' && (method !== 'jobs.get' || (shared.entry.snapshot.data as { status?: string } | null)?.status === 'running')) void shared.entry.refresh(); }, poll);
    return () => {
      shared.users--; if (live) shared.live--;
      if (!shared.users && shared.timer) { clearInterval(shared.timer); shared.timer = null; }
    };
  }, [shared, poll, live, method]);
  return { data: snapshot.data as T | null, loading: snapshot.loading, error: snapshot.error, refresh: shared.entry.refresh };
}
