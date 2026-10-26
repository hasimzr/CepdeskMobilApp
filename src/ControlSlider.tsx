import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
export const clampFraction = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export default function ControlSlider({ value, onCommit, disabled = false, label, color, track }: { value: number; onCommit: (fraction: number) => void; disabled?: boolean; label: string; color: string; track: string }) {
  const [preview, setPreview] = useState<number | null>(null); const [optimistic, setOptimistic] = useState<number | null>(null); const width = useRef(1); const start = useRef(0); const pending = useRef(value);
  const commit = useRef(onCommit);
  useEffect(() => { setOptimistic(null); }, [value]);
  useEffect(() => { if (optimistic === null) return; const timer = setTimeout(() => setOptimistic(null), 2500); return () => clearTimeout(timer); }, [optimistic]);
  const current = useRef({ value, disabled, onCommit }); current.current = { value, disabled, onCommit };
  const gesture = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !current.current.disabled,
    onMoveShouldSetPanResponder: () => !current.current.disabled,
    onPanResponderGrant: event => { commit.current = current.current.onCommit; start.current = event.nativeEvent.locationX; pending.current = clampFraction(start.current / width.current); setPreview(pending.current); },
    onPanResponderMove: (_, move) => { pending.current = clampFraction((start.current + move.dx) / width.current); setPreview(pending.current); },
    onPanResponderRelease: () => { const fraction = pending.current; setPreview(null); if (!current.current.disabled)  { setOptimistic(fraction); commit.current(fraction); } },
    onPanResponderTerminate: () => setPreview(null),
    onPanResponderTerminationRequest: event => event.nativeEvent.touches.length >= 2,
  }), []);
  const fraction = preview ?? optimistic ?? clampFraction(value);
  return <View {...gesture.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityState={{ disabled }} accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }} accessibilityActions={[{ name: 'increment', label: 'Artır' }, { name: 'decrement', label: 'Azalt' }]}
    onAccessibilityAction={event => { if (!disabled) onCommit(clampFraction(value + (event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05))); }}
    onLayout={event => { width.current = Math.max(1, event.nativeEvent.layout.width); }} style={{ height: 38, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
    <View pointerEvents="none" style={{ height: 5, backgroundColor: track, borderRadius: 5 }}><View style={{ height: 5, backgroundColor: color, borderRadius: 5, width: `${fraction * 100}%` }} /></View>
    <View pointerEvents="none" style={{ position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: color, left: `${fraction * 100}%`, marginLeft: -7 }} />
    {preview !== null && <Text pointerEvents="none" style={{ position: 'absolute', right: 0, top: -6, color, fontSize: 10 }}>{Math.round(fraction * 100)}%</Text>}
  </View>;
}
