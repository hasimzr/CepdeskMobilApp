import { useEffect, useId, useRef } from 'react';
export type InputTouch = { surface: string; action: 'key' | 'move' | 'scroll' | 'monitor.tap' | 'monitor.scroll'; code?: number; down?: boolean; x?: number; y?: number; dx?: number; dy?: number };
const listeners = new Map<string, (event: InputTouch) => void>();
export function dispatchInputTouch(event: InputTouch) { listeners.get(event.surface)?.(event); }
export function useInputTouch(handler: (event: InputTouch) => void) {
  const surface = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const current = useRef(handler); current.current = handler;
  useEffect(() => { listeners.set(surface, event => current.current(event)); return () => { listeners.delete(surface); }; }, [surface]);
  return surface;
}
