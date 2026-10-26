import React, { useRef, useState } from 'react';
import { Animated, PanResponder, View, type GestureResponderEvent, type LayoutRectangle } from 'react-native';
import { moveItem } from './reorder';
type DragProps = { onLongPress: (event: GestureResponderEvent) => void; onPress: () => void };
export default function ReorderGrid<T extends { id: string }>({ items, width, gap = 0, onReorder, onPress, renderItem }: {
  items: T[]; width: number; gap?: number; onReorder: (ids: string[]) => void; onPress: (item: T) => void; renderItem: (item: T, props: DragProps) => React.ReactNode;
}) {
  const grid = useRef<View>(null); const rects = useRef(new Map<string, LayoutRectangle>());
  const touching = useRef(false); const gestureEpoch = useRef(0);
  const drag = useRef<{ id: string; target: string; originX: number; originY: number } | null>(null);
  for (const id of rects.current.keys()) if (!items.some(item => item.id === id)) rects.current.delete(id);
  const latest = useRef({ items, onReorder }); latest.current = { items, onReorder };
  const [active, setActive] = useState(''); const [target, setTarget] = useState('');
  const offset = useRef(new Animated.ValueXY()).current; const scale = useRef(new Animated.Value(1)).current;
  const stop = (commit: boolean) => {
    const current = drag.current; drag.current = null; setActive(''); setTarget(''); offset.setValue({ x: 0, y: 0 }); scale.setValue(1);
    if (commit && current && current.id !== current.target) latest.current.onReorder(moveItem(latest.current.items.map(item => item.id), current.id, current.target));
  };
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (event) => !!drag.current && event.nativeEvent.touches.length === 1,
    onPanResponderMove: (event, gesture) => {
      const current = drag.current; if (!current) return;
      if (event.nativeEvent.touches.length !== 1) { stop(false); return; }
      offset.setValue({ x: gesture.dx, y: gesture.dy });
      const x = event.nativeEvent.pageX - current.originX; const y = event.nativeEvent.pageY - current.originY;
      for (const [id, rect] of rects.current) if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) { current.target = id; setTarget(id); break; }
    },
    onPanResponderRelease: () => stop(true), onPanResponderTerminate: () => stop(false), onPanResponderTerminationRequest: () => true,
  })).current;
  return <View ref={grid} collapsable={false} {...responder.panHandlers} onTouchStart={event => { touching.current = event.nativeEvent.touches.length === 1; if (!touching.current) { gestureEpoch.current++; stop(false); } }} onTouchEnd={() => { touching.current = false; gestureEpoch.current++; const current = drag.current; setTimeout(() => { if (drag.current === current) stop(false); }, 0); }} onTouchCancel={() => { touching.current = false; gestureEpoch.current++; stop(false); }} style={{ flexDirection: 'row', flexWrap: 'wrap', gap, alignItems: 'stretch' }}>
    {items.map(item => <Animated.View key={item.id} onLayout={event => rects.current.set(item.id, event.nativeEvent.layout)} style={{ width, zIndex: active === item.id ? 10 : 0, opacity: target === item.id && active !== item.id ? 0.55 : 1, transform: active === item.id ? [...offset.getTranslateTransform(), { scale }] : [] }}>
      {renderItem(item, { onPress: () => { if (!drag.current && !active) onPress(item); }, onLongPress: event => {
        if (event.nativeEvent.touches.length !== 1) return;
        const epoch = gestureEpoch.current;
        grid.current?.measureInWindow((x, y) => { if (!touching.current || epoch !== gestureEpoch.current) return; drag.current = { id: item.id, target: item.id, originX: x, originY: y }; offset.setValue({ x: 0, y: 0 }); setActive(item.id); setTarget(item.id); Animated.spring(scale, { toValue: 1.12, useNativeDriver: true }).start(); });
      } })}
    </Animated.View>)}
  </View>;
}
