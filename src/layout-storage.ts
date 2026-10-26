import type { DashboardLayout } from './dashboard-layout';
// Keep writes ordered, coalescing intermediate snapshots during rapid edits.
// Each caller settles once the complete snapshot covering its edit is written.
export function layoutWriter<T = DashboardLayout>(write: (raw: string) => Promise<void>) {
  type Waiter = { resolve: () => void; reject: (error: unknown) => void };
  let pending: { raw: string; waiters: Waiter[] } | null = null;
  let running = false;
  const pump = async () => {
    if (running) return; running = true;
    while (pending) {
      const snapshot = pending; pending = null;
      try { await write(snapshot.raw); snapshot.waiters.forEach(waiter => waiter.resolve()); }
      catch (error) { snapshot.waiters.forEach(waiter => waiter.reject(error)); }
    }
    running = false;
  };
  return (model: T): Promise<void> => new Promise((resolve, reject) => {
    const raw = JSON.stringify(model);
    if (pending) { pending.raw = raw; pending.waiters.push({ resolve, reject }); }
    else pending = { raw, waiters: [{ resolve, reject }] };
    void pump();
  });
}
