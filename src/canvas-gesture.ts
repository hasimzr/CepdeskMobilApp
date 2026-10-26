export type Touch = { id: string; x: number; y: number };
export function twoFingerDirection(start: Touch[], end: Touch[]): -1 | 1 | null {
  if (start.length !== 2 || end.length !== 2) return null;
  const moved = start.map(touch => { const last = end.find(item => item.id === touch.id); return last ? { x: last.x - touch.x, y: last.y - touch.y } : null; });
  if (moved.some(value => !value)) return null;
  const a = moved[0]!; const b = moved[1]!;
  if (Math.abs(a.x) < 60 || Math.abs(b.x) < 60 || Math.sign(a.x) !== Math.sign(b.x)) return null;
  if (Math.abs(a.y) > Math.abs(a.x) * 0.6 || Math.abs(b.y) > Math.abs(b.x) * 0.6) return null;
  // A pinch spreads fingers rather than translating both by a similar distance.
  if (Math.abs(a.x - b.x) > 45 || Math.abs(a.y - b.y) > 45) return null;
  return a.x < 0 ? 1 : -1;
}
