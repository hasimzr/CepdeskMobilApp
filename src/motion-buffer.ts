export type MotionBuffer = { x: number; y: number; sx: number; sy: number };
export const emptyMotion = (): MotionBuffer => ({ x: 0, y: 0, sx: 0, sy: 0 });
const step = (value: number) => Math.max(-2048, Math.min(2048, Math.trunc(value)));
export function takeMotion(buffer: MotionBuffer, pointerOnly = false): { method: 'input.move' | 'input.scroll'; x: number; y: number } | null {
  const sx = pointerOnly ? 0 : step(buffer.sx); const sy = pointerOnly ? 0 : step(buffer.sy);
  // Fractional wheel remainders must not prevent the pointer queue from draining.
  if (sx || sy) { buffer.sx -= sx; buffer.sy -= sy; return { method: 'input.scroll', x: sx, y: sy }; }
  const x = step(buffer.x); const y = step(buffer.y);
  if (!x && !y) return null;
  buffer.x -= x; buffer.y -= y;
  return { method: 'input.move', x, y };
}
