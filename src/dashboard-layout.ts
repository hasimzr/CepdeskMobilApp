export const PANEL_IDS = ['applications', 'clipboard', 'windows', 'media', 'commands', 'system', 'touchpad', 'keyboard', 'monitor'] as const;
export type PanelId = typeof PANEL_IDS[number];
export type PanelSpan = 1 | 2 | 3 | 4;
export type DashboardLayout = { version: 3; order: PanelId[]; spans: Record<PanelId, PanelSpan>; heights?: Partial<Record<PanelId, number>>; widths?: Partial<Record<PanelId, number>> };
export type PanelRect = { id: PanelId; x: number; y: number; width: number; height: number; span: number };
export const GRID_GAP = 12;
export const PANEL_HEIGHT = 420;
export function defaultLayout(): DashboardLayout {
  return { version: 3, order: PANEL_IDS.filter(id => id !== 'touchpad' && id !== 'keyboard' && id !== 'monitor'), spans: { applications: 4, clipboard: 2, windows: 2, media: 2, commands: 2, system: 2, touchpad: 4, keyboard: 4, monitor: 4 } };
}
export function parseLayout(raw: string | null): DashboardLayout {
  const fallback = defaultLayout();
  if (!raw) return fallback;
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !('version' in saved) || (saved.version !== 1 && saved.version !== 2 && saved.version !== 3)) return fallback;
    const value = saved as { version: number; order?: unknown[]; spans?: Record<string, unknown> };
    const expected: readonly PanelId[] = value.version === 1 ? fallback.order.filter(id => id !== 'applications' && id !== 'system') : value.version === 2 ? fallback.order.filter(id => id !== 'system') : PANEL_IDS.filter(id => id !== 'touchpad' && id !== 'keyboard' && id !== 'monitor');
    if (!Array.isArray(value.order) || value.order.length !== expected.length || new Set(value.order).size !== expected.length || value.order.some(id => !expected.includes(id as PanelId))) return fallback;
    for (const id of expected) { const span = value.spans?.[id]; if (typeof span !== 'number' || !Number.isInteger(span) || span < 1 || span > 4) return fallback; }
    const order = value.order as PanelId[];
    const spans = { ...fallback.spans };
    for (const id of expected) spans[id] = value.spans![id] as PanelSpan;
    for (const id of ['touchpad', 'keyboard', 'monitor'] as const) { const span = value.spans?.[id]; if (typeof span === 'number' && Number.isInteger(span) && span >= 1 && span <= 4) spans[id] = span as PanelSpan; }
    return { version: 3, order: value.version === 1 ? ['applications', ...order, 'system'] : value.version === 2 ? [...order, 'system'] : [...order], spans };
  } catch { return fallback; }
}
// Narrow screens retain saved proportions while preventing quarter-width panels
// from becoming unusable. Rotating back restores the saved wider-screen choice.
export function minimumSpan(width: number): PanelSpan { return width >= 960 ? 1 : 2; }
export function gridRects(layout: DashboardLayout, width: number, height = PANEL_HEIGHT): PanelRect[] {
  const available = Math.max(1, width);
  const unit = (available + GRID_GAP) / 4;
  let x = 0; let y = 0; let rowHeight = 0;
  return layout.order.map(id => {
    const legacy = Math.max(minimumSpan(available), layout.spans[id]);
    const fraction = layout.widths?.[id];
    const panelWidth = fraction === undefined ? unit * legacy - GRID_GAP : Math.min(available, Math.max(100, (available + GRID_GAP) * fraction - GRID_GAP));
    if (x + panelWidth > available + 0.01) { y += rowHeight + GRID_GAP; x = 0; rowHeight = 0; }
    const panelHeight = layout.heights?.[id] ?? (id === 'applications' ? 156 : height);
    const rect = { id, x, y, width: panelWidth, height: panelHeight, span: fraction === undefined ? legacy : fraction * 4 };
    x += panelWidth + GRID_GAP; rowHeight = Math.max(rowHeight, panelHeight);
    return rect;
  });
}
export function movePanel(layout: DashboardLayout, from: PanelId, to: PanelId): DashboardLayout {
  const source = layout.order.indexOf(from); const target = layout.order.indexOf(to);
  if (source < 0 || target < 0 || source === target) return layout;
  const order = [...layout.order]; order.splice(source, 1); order.splice(target, 0, from);
  return { ...layout, order };
}
export function resizedSpan(start: number, dx: number, canvasWidth: number): PanelSpan {
  return Math.min(4, Math.max(minimumSpan(canvasWidth), Math.round((start + dx + GRID_GAP) / ((canvasWidth + GRID_GAP) / 4)))) as PanelSpan;
}
export function dropTarget(rects: PanelRect[], moving: PanelId, dx: number, dy: number): PanelId | null {
  const source = rects.find(rect => rect.id === moving);
  if (!source || Math.hypot(dx, dy) < 12) return null;
  const x = source.x + source.width / 2 + dx; const y = source.y + source.height / 2 + dy;
  const target = rects.find(rect => rect.id !== moving && x >= rect.x - GRID_GAP / 2 && x <= rect.x + rect.width + GRID_GAP / 2 && y >= rect.y - GRID_GAP / 2 && y <= rect.y + rect.height + GRID_GAP / 2);
  return target?.id ?? null;
}

export function freeWidth(pixels: number, canvasWidth: number): number {
  const available = Math.max(100, canvasWidth);
  const width = Math.max(Math.min(100, canvasWidth), Math.min(available, pixels));
  return Math.max(0.05, Math.min(1, (width + GRID_GAP) / (available + GRID_GAP)));
}
