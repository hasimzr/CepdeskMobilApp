export type RemoteSnapshot = { data: unknown; loading: boolean; error: string };
export class RemoteEntry {
  snapshot: RemoteSnapshot = { data: null, loading: false, error: '' };
  listeners = new Set<() => void>();
  private pending: Promise<void> | null = null;
  private epoch = 0;
  constructor(private fetch: () => Promise<unknown>) {}
  private publish(snapshot: RemoteSnapshot) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()); }
  refresh = (): Promise<void> => {
    if (this.pending) return this.pending;
    const epoch = this.epoch; this.publish({ ...this.snapshot, loading: true });
    const operation = (async () => {
      try { const data = await this.fetch(); if (epoch === this.epoch) this.publish({ data, loading: false, error: '' }); }
      catch (e) { if (epoch === this.epoch) this.publish({ ...this.snapshot, loading: false, error: e instanceof Error ? e.message : 'Veriler alınamadı.' }); }
    })();
    this.pending = operation;
    void operation.finally(() => { if (this.pending === operation) this.pending = null; });
    return operation;
  };
  clear() { this.epoch++; this.pending = null; this.publish({ data: null, loading: false, error: '' }); }
}
