export function moveItem(ids: string[], id: string, target: string): string[] {
  const from = ids.indexOf(id); const to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids]; next.splice(from, 1); next.splice(to, 0, id); return next;
}
export function reconcileOrder(order: string[], ids: string[]): string[] {
  const live = new Set(ids); const kept = order.filter(id => live.has(id));
  const seen = new Set(kept); return [...kept, ...ids.filter(id => !seen.has(id))];
}
