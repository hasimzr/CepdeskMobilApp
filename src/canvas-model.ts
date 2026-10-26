import { defaultLayout, PANEL_IDS, parseLayout, type DashboardLayout, type PanelId, type PanelSpan } from './dashboard-layout';
export type Canvas = { id: string; name: string; layout: DashboardLayout };
export type Workspace = { version: 2; active: string; canvases: Canvas[] };
export const PANEL_NAMES: Record<PanelId, string> = { applications: 'Favori uygulamalar', clipboard: 'Pano', windows: 'Açık pencereler', media: 'Medya', commands: 'Komutlar', system: 'Sistem', touchpad: 'Touchpad', keyboard: 'Klavye', monitor: 'Monitör' };
export function firstWorkspace(legacy: string | null = null): Workspace {
  const layout = parseLayout(legacy); layout.heights = {}; layout.widths = {};
  for (const id of PANEL_IDS) layout.heights[id] = id === 'applications' ? 160 : 320;
  const canvas = { id: 'first-canvas', name: 'Ana tuval', layout };
  return { version: 2, active: canvas.id, canvases: [canvas] };
}
export function canvasLayout(value: unknown): DashboardLayout | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Partial<DashboardLayout>;
  if (saved.version !== 3) return null;
  if (!Array.isArray(saved.order) || new Set(saved.order).size !== saved.order.length || saved.order.some(id => !PANEL_IDS.includes(id))) return null;
  const layout = defaultLayout(); layout.order = [...saved.order]; layout.heights = {}; layout.widths = {};
  for (const id of PANEL_IDS) {
    const span = saved.spans?.[id] ?? ((id === 'touchpad' || id === 'keyboard' || id === 'monitor') ? 4 : undefined); if (typeof span !== 'number' || !Number.isInteger(span) || span < 1 || span > 4) return null;
    layout.spans[id] = span as PanelSpan;
    const width = saved.widths?.[id];
    if (width !== undefined) { if (typeof width !== 'number' || !Number.isFinite(width) || width < 0.05 || width > 1) return null; layout.widths![id] = width; }
    const height = saved.heights?.[id];
    if (height !== undefined) { if (!Number.isInteger(height) || height < 160 || height > 1600) return null; layout.heights[id] = height; }
  }
  return layout;
}
export function parseWorkspace(raw: string): Workspace | null {
  try {
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return null;
    const value = saved as { version?: number; active?: string; canvases?: Canvas[] };
    if ((value.version !== 1 && value.version !== 2) || !Array.isArray(value.canvases) || !value.canvases.length) return null;
    const ids = new Set<string>(); const canvases: Canvas[] = [];
    for (const item of value.canvases) {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60) return null;
      const layout = canvasLayout(item.layout); if (!layout) return null;
      ids.add(item.id); canvases.push({ id: item.id, name: item.name, layout });
    }
    return { version: 2, active: ids.has(value.active ?? '') ? value.active! : canvases[0]!.id, canvases };
  } catch { return null; }
}
export function changeCanvas(workspace: Workspace, id: string, change: (canvas: Canvas) => Canvas): Workspace {
  return { ...workspace, canvases: workspace.canvases.map(canvas => canvas.id === id ? change(canvas) : canvas) };
}
export function addCanvas(workspace: Workspace, id: string): Workspace {
  if (workspace.canvases.some(canvas => canvas.id === id)) return workspace;
  const layout = defaultLayout(); layout.order = []; layout.heights = {}; layout.widths = {};
  for (const panel of PANEL_IDS) layout.heights[panel] = panel === 'applications' ? 160 : 320;
  return { ...workspace, active: id, canvases: [...workspace.canvases, { id, name: `Tuval ${workspace.canvases.length + 1}`, layout }] };
}
export function removeCanvas(workspace: Workspace, id: string): Workspace {
  if (workspace.canvases.length <= 1) return workspace;
  const index = workspace.canvases.findIndex(canvas => canvas.id === id); if (index < 0) return workspace;
  const canvases = workspace.canvases.filter(canvas => canvas.id !== id);
  return { ...workspace, canvases, active: workspace.active === id ? canvases[Math.min(index, canvases.length - 1)]!.id : workspace.active };
}
export function switchCanvas(workspace: Workspace, direction: -1 | 1): Workspace {
  const current = workspace.canvases.findIndex(canvas => canvas.id === workspace.active);
  const next = Math.max(0, Math.min(workspace.canvases.length - 1, current + direction));
  return next === current ? workspace : { ...workspace, active: workspace.canvases[next]!.id };
}
export function togglePanel(layout: DashboardLayout, id: PanelId): DashboardLayout {
  return { ...layout, order: layout.order.includes(id) ? layout.order.filter(panel => panel !== id) : [...layout.order, id] };
}
export function panelHeight(height: number): number { return Math.max(160, Math.min(1600, Math.round(height))); }
