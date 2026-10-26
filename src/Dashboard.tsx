import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useWorkspace } from './Workspace';
import { panelHeight as clampHeight } from './canvas-model';
import { dropTarget, freeWidth, gridRects, movePanel, type DashboardLayout, type PanelId, type PanelRect } from './dashboard-layout';

export const PanelSizeContext = createContext<{ width: number; height: number } | null>(null);
export const PanelWidthContext = createContext<number | null>(null);
type Colors = { bg: string; surface: string; text: string; muted: string; accent: string; tint: string; line: string };
const panels: Record<PanelId, { title: string; symbol: string }> = {
  monitor: { title: 'Monitör', symbol: '▣' }, touchpad: { title: 'Touchpad', symbol: '▱' }, keyboard: { title: 'Klavye', symbol: '⌨' }, system: { title: 'Sistem', symbol: '⚙' }, applications: { title: 'Uygulamalar', symbol: '◈' }, clipboard: { title: 'Pano', symbol: '▤' }, windows: { title: 'Pencereler', symbol: '▣' },
  media: { title: 'Medya', symbol: '♫' }, commands: { title: 'Komutlar', symbol: '›_' },
};
type Props = { layout: DashboardLayout; onChange: (layout: DashboardLayout) => void; onConfigure: () => void; onRemove?: (id: PanelId) => void; colors: Colors; editing: boolean; onEditingChange: (value: boolean) => void; renderPanel: (id: PanelId) => React.ReactNode };
export default function Dashboard({ colors: c, renderPanel, editing, onEditingChange, layout, onChange, onConfigure, onRemove }: Props) {
  const workspace = useWorkspace(); const ready = workspace.ready;
  const [width, setWidth] = useState(0); const [viewportHeight, setViewportHeight] = useState(0);
  const [active, setActive] = useState<PanelId | null>(null); const [target, setTarget] = useState<PanelId | null>(null);
  const [preview, setPreview] = useState<{ id: PanelId; width: number; height: number } | null>(null);
  const scroll = useRef<ScrollView>(null); const scrollY = useRef(0);
  const viewport = useRef({ top: 0, height: 0, contentHeight: 0 });
  const scrollDelta = useRef(new Animated.Value(0)).current;
  const gesture = useRef<{ id: PanelId; dx: number; dy: number; pointerY: number; startScroll: number } | null>(null);
  const panelHeight = viewportHeight ? Math.max(240, Math.min(420, (viewportHeight - 188) / 2)) : 320;
  const latest = useRef({ layout, width, panelHeight }); latest.current = { layout, width, panelHeight };
  useEffect(() => {
    if (!active) return;
    // Continue edge scrolling even while the finger is held still, keeping the
    // floating panel and its drop target in content coordinates.
    const timer = setInterval(() => {
      const drag = gesture.current; if (!drag) return;
      const view = viewport.current;
      const speed = drag.pointerY < view.top + 56 ? -10 : drag.pointerY > view.top + view.height - 56 ? 10 : 0;
      const next = Math.max(0, Math.min(Math.max(0, view.contentHeight - view.height), scrollY.current + speed));
      if (!speed || next === scrollY.current) return;
      scrollY.current = next; scroll.current?.scrollTo({ y: next, animated: false });
      const delta = next - drag.startScroll; scrollDelta.setValue(delta);
      setTarget(dropTarget(gridRects(latest.current.layout, latest.current.width, latest.current.panelHeight), drag.id, drag.dx, drag.dy + delta));
    }, 30);
    return () => clearInterval(timer);
  }, [active, scrollDelta]);
  const save = (next: DashboardLayout) => onChange(next);
  const shown = preview ? { ...layout, widths: { ...layout.widths, [preview.id]: preview.width }, heights: { ...layout.heights, [preview.id]: preview.height } } : layout;
  const rects = gridRects(shown, width, panelHeight);
  const startScroll = useRef(0);
  const begin = (id: PanelId) => { startScroll.current = scrollY.current; scrollDelta.setValue(0); gesture.current = null; setActive(id); setTarget(null); };
  const end = () => { gesture.current = null; scrollDelta.setValue(0); setActive(null); setTarget(null); setPreview(null); };
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={c.accent} /><Text style={{ color: c.muted }}>{workspace.error || 'Çalışma alanı hazırlanıyor…'}</Text></View>;
  return <ScrollView ref={scroll} scrollEnabled={!active} nestedScrollEnabled
    onLayout={event => { viewport.current.height = event.nativeEvent.layout.height; setViewportHeight(event.nativeEvent.layout.height); scroll.current?.getNativeScrollRef()?.measureInWindow((_, top) => { viewport.current.top = top; }); }}
    onContentSizeChange={(_, height) => { viewport.current.contentHeight = height; }}
    onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.workspace}>
    {workspace.error && <View accessibilityLiveRegion="polite" style={styles.toolbar}><Text style={[styles.caption, { color: c.muted, flex: 1 }]}>{workspace.error}</Text><Pressable accessibilityRole="button" onPress={workspace.retry} style={[styles.action, { backgroundColor: c.tint }]}><Text style={{ color: c.accent }}>Tekrar kaydet</Text></Pressable></View>}
    <View onLayout={event => { const next = event.nativeEvent.layout.width; if (next > 0 && next !== width) { end(); setWidth(next); } }} style={{ height: width ? Math.max(120, ...rects.map(rect => rect.y + rect.height)) : 1 }}>
      {!layout.order.length && <View style={{ padding: 20, gap: 12, alignItems: 'center' }}><Text style={{ color: c.muted }}>Bu tuval boş. Ekran ekleyerek tasarlamaya başla.</Text><Pressable accessibilityRole="button" onPress={onConfigure} style={[styles.action, { backgroundColor: c.tint }]}><Text style={{ color: c.accent }}>Tuvali tasarla</Text></Pressable></View>}
      {width > 0 && rects.map(rect => <DashboardPanel key={rect.id} rect={rect} canvasWidth={width} editing={editing} active={active === rect.id} highlighted={target === rect.id} colors={c} scrollDelta={scrollDelta}
        onBegin={() => begin(rect.id)} onMove={(dx, dy, pointerY) => { gesture.current = { id: rect.id, dx, dy, pointerY, startScroll: startScroll.current }; setTarget(dropTarget(gridRects(layout, width, panelHeight), rect.id, dx, dy + scrollY.current - startScroll.current)); }}
        onDrop={(dx, dy) => { const destination = dropTarget(gridRects(layout, width, panelHeight), rect.id, dx, dy + scrollY.current - startScroll.current); if (destination) save(movePanel(layout, rect.id, destination)); end(); }}
        onResizePreview={(fraction, height) => setPreview({ id: rect.id, width: fraction, height })}
        onResizeEnd={(fraction, height) => { save({ ...layout, widths: { ...layout.widths, [rect.id]: fraction }, heights: { ...layout.heights, [rect.id]: height } }); end(); }}
        onCancel={end} onRemove={() => onRemove?.(rect.id)}
        onAccessibleMove={direction => { const index = layout.order.indexOf(rect.id); const neighbor = layout.order[index + direction]; if (neighbor) save(movePanel(layout, rect.id, neighbor)); }}>
        {renderPanel(rect.id)}
      </DashboardPanel>)}
    </View>
  </ScrollView>;
}
type PanelProps = {
  rect: PanelRect; canvasWidth: number; scrollDelta: Animated.Value; editing: boolean; active: boolean; highlighted: boolean; colors: Colors; children: React.ReactNode;
  onBegin: () => void; onMove: (dx: number, dy: number, pointerY: number) => void; onDrop: (dx: number, dy: number) => void;
  onResizePreview: (fraction: number, height: number) => void; onResizeEnd: (fraction: number, height: number) => void; onCancel: () => void;
  onRemove: () => void; onAccessibleMove: (direction: number) => void;
};
function DashboardPanel(props: PanelProps) {
  const { rect, canvasWidth, editing, active, highlighted, colors: c, children } = props;
  const current = useRef(props); current.current = props;
  const translation = useRef(new Animated.ValueXY()).current;
  useEffect(() => { if (!active) translation.setValue({ x: 0, y: 0 }); }, [active, translation]);
  const resizeStart = useRef({ width: 0, height: 0 }); const dimensions = useRef({ width: 1, height: rect.height });
  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => current.current.editing,
    onMoveShouldSetPanResponder: () => current.current.editing,
    onPanResponderGrant: () => { translation.setValue({ x: 0, y: 0 }); current.current.onBegin(); },
    onPanResponderMove: (_, gesture) => { translation.setValue({ x: gesture.dx, y: gesture.dy }); current.current.onMove(gesture.dx, gesture.dy, gesture.moveY); },
    onPanResponderRelease: (_, gesture) => { translation.setValue({ x: 0, y: 0 }); current.current.onDrop(gesture.dx, gesture.dy); },
    onPanResponderTerminate: () => { translation.setValue({ x: 0, y: 0 }); current.current.onCancel(); },
    onPanResponderTerminationRequest: () => false,
  }), [translation]);
  const resizers = useMemo(() => {
    const create = (axis: 'width' | 'both') => PanResponder.create({
      onStartShouldSetPanResponder: () => current.current.editing,
      onMoveShouldSetPanResponder: () => current.current.editing,
      onPanResponderGrant: () => { resizeStart.current = { width: current.current.rect.width, height: current.current.rect.height }; dimensions.current = { width: freeWidth(resizeStart.current.width, current.current.canvasWidth), height: resizeStart.current.height }; current.current.onBegin(); },
      onPanResponderMove: (_, gesture) => {
        dimensions.current = { width: freeWidth(resizeStart.current.width + gesture.dx, current.current.canvasWidth), height: axis === 'both' ? clampHeight(resizeStart.current.height + gesture.dy) : resizeStart.current.height };
        current.current.onResizePreview(dimensions.current.width, dimensions.current.height);
      },
      onPanResponderRelease: () => current.current.onResizeEnd(dimensions.current.width, dimensions.current.height),
      onPanResponderTerminate: () => current.current.onCancel(),
      onPanResponderTerminationRequest: () => false,
    });
    return { width: create('width'), both: create('both') };
  }, []);
  const { title, symbol } = panels[rect.id];
  return <Animated.View style={[styles.panel, { left: rect.x, top: rect.y, width: rect.width, height: rect.height, backgroundColor: c.surface, borderColor: active || highlighted ? c.accent : c.line, borderWidth: active || highlighted ? 2 : 1, zIndex: active ? 10 : 1, elevation: active ? 10 : 0, transform: [{ translateX: translation.x }, { translateY: active ? Animated.add(translation.y, props.scrollDelta) : translation.y }] }]}>
    {editing && <View style={[styles.panelHeader, { borderColor: c.line, backgroundColor: c.tint }]}>
      <View {...drag.panHandlers} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityRole="adjustable" accessibilityLabel={`${title} bölümünü taşı`} accessibilityActions={[{ name: 'increment', label: 'Sonraki konuma taşı' }, { name: 'decrement', label: 'Önceki konuma taşı' }]} onAccessibilityAction={event => props.onAccessibleMove(event.nativeEvent.actionName === 'increment' ? 1 : -1)}><Text style={{ color: c.accent }}>{symbol}</Text><Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 12, fontWeight: '600' }}>{title}</Text><Text style={{ color: c.accent, fontSize: 20 }}>⠿</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} ekranını tuvalden çıkar`} onPress={props.onRemove} style={{ width: 30, height: 36, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.accent, fontSize: 22 }}>×</Text></Pressable>
    </View>}
    <View style={{ flex: 1 }} pointerEvents={editing ? 'none' : 'auto'} accessibilityElementsHidden={editing} importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}>
      <ScrollView nestedScrollEnabled scrollEnabled={!editing && rect.id !== 'touchpad' && rect.id !== 'keyboard' && rect.id !== 'monitor'} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
        <PanelSizeContext.Provider value={{ width: rect.width - 22, height: rect.height - (editing ? 76 : 0) }}><PanelWidthContext.Provider value={rect.width - 22}>{children}</PanelWidthContext.Provider></PanelSizeContext.Provider>
      </ScrollView>
    </View>
    {editing && <>
      <View {...resizers.width.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`${title} genişliğini sürükleyerek ayarla`} accessibilityActions={[{ name: 'increment', label: 'Genişlet' }, { name: 'decrement', label: 'Daralt' }]} onAccessibilityAction={event => props.onResizeEnd(freeWidth(rect.width + (event.nativeEvent.actionName === 'increment' ? 20 : -20), canvasWidth), rect.height)} style={{ position: 'absolute', right: 0, top: 50, bottom: 30, width: 18, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 3, height: 30, backgroundColor: c.accent, borderRadius: 3 }} /></View>
      <View style={{ height: 28, paddingHorizontal: 8, justifyContent: 'center' }}><Text style={{ color: c.muted, fontSize: 10 }}>{Math.round(rect.width)} × {Math.round(rect.height)}</Text></View>
      <View {...resizers.both.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={`${title} boyutlarını köşeden sürükle`} style={{ position: 'absolute', right: 0, bottom: 0, width: 36, height: 36, justifyContent: 'center', alignItems: 'center', backgroundColor: c.tint, borderTopLeftRadius: 10 }}><Text style={{ color: c.accent, fontSize: 20 }}>↘</Text></View>
    </>}

  </Animated.View>;
}
const styles = StyleSheet.create({
  workspace: { padding: 8, paddingBottom: 12, gap: 8, maxWidth: 1600, width: '100%', alignSelf: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  title: { fontSize: 21, fontWeight: '800', marginBottom: 4 }, caption: { fontSize: 12, lineHeight: 18 },
  action: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', borderRadius: 18, overflow: 'hidden' },
  panelHeader: { minHeight: 48, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 1 },
  panelContent: { padding: 10, gap: 8 },
  widthOptions: { padding: 6, flexDirection: 'row', gap: 4 }, widthOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  resizeHandle: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1 },
});
