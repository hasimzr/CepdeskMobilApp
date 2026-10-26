import React, { useState } from 'react';
import { View, useWindowDimensions, type NativeSyntheticEvent, type ViewProps } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';
import { dispatchInputTouch, type InputTouch } from './input-touch';
import type { Canvas } from './canvas-model';
type NativeProps = ViewProps & { page: number; count: number; pagingEnabled: boolean; onInputTouch: (event: NativeSyntheticEvent<InputTouch>) => void; onPageSelected: (event: NativeSyntheticEvent<{ index: number }>) => void };
const Pager = requireNativeViewManager<NativeProps>('CepDeskNative');
export default function CanvasPager({ canvases, active, disabled, onSelect, renderCanvas }: { canvases: Canvas[]; active: string; disabled: boolean; onSelect: (id: string) => void; renderCanvas: (canvas: Canvas) => React.ReactNode }) {
  const dimensions = useWindowDimensions(); const [width, setWidth] = useState(dimensions.width);
  const index = Math.max(0, canvases.findIndex(canvas => canvas.id === active));
  return <Pager style={{ flex: 1, overflow: 'hidden' }} count={canvases.length} page={index} pagingEnabled={!disabled} onInputTouch={event => dispatchInputTouch(event.nativeEvent)} onLayout={event => { if (event.nativeEvent.layout.width > 0) setWidth(event.nativeEvent.layout.width); }} onPageSelected={event => { const canvas = canvases[event.nativeEvent.index]; if (canvas && canvas.id !== active) onSelect(canvas.id); }}>
    <View collapsable={false} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: Math.max(1,width) * canvases.length, flexDirection: 'row' }}>
      {canvases.map(canvas => <View key={canvas.id} style={{ width: Math.max(1,width), height: '100%' }} accessibilityElementsHidden={canvas.id !== active} importantForAccessibility={canvas.id === active ? 'auto' : 'no-hide-descendants'}>{renderCanvas(canvas)}</View>)}
    </View>
  </Pager>;
}

// A single-page input host gives fullscreen modals the same independent pointer tracking.
export function InputHost({ children }: { children: React.ReactNode }) {
  return <Pager style={{ flex: 1 }} count={1} page={0} pagingEnabled={false} onInputTouch={event => dispatchInputTouch(event.nativeEvent)} onPageSelected={() => {}}><View collapsable={false} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>{children}</View></Pager>;
}
