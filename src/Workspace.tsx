import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as SecureStore from 'expo-secure-store';
import { layoutWriter } from './layout-storage';
import { addCanvas, changeCanvas, firstWorkspace, parseWorkspace, removeCanvas, switchCanvas, type Canvas, type Workspace } from './canvas-model';
interface Storage { readWorkspace(): Promise<string | null>; writeWorkspace(raw: string): Promise<void> }
const native = requireOptionalNativeModule<Storage>('CepDeskNative');
type State = { model: Workspace; ready: boolean; error: string; update: (change: (model: Workspace) => Workspace) => void; modify: (id: string, change: (canvas: Canvas) => Canvas) => void; select: (id: string) => void; next: (direction: -1 | 1) => void; create: () => string; remove: (id: string) => void; retry: () => void };
const Context = createContext<State | null>(null);
export function useWorkspace() { const value = useContext(Context); if (!value) throw new Error('Tuval sağlayıcısı bulunamadı.'); return value; }
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [loadAttempt, setLoadAttempt] = useState(0); const [model, setModel] = useState(firstWorkspace); const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const current = useRef(model); current.current = model; const revision = useRef(0);
  const write = useRef(layoutWriter<Workspace>(async raw => { if (!native) throw new Error('Tuval kaydı için güncel APK gereklidir.'); await native.writeWorkspace(raw); })).current;
  const save = useCallback((next: Workspace) => {
    const generation = ++revision.current;
    void write(next).then(() => { if (revision.current === generation) setError(''); }).catch(() => { if (revision.current === generation) setError('Tuvaller kaydedilemedi. Tekrar kaydet düğmesini kullanın.'); });
  }, [write]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const raw = native ? await native.readWorkspace() : null;
        const parsed = raw ? parseWorkspace(raw) : null;
        if (raw && !parsed) throw new Error('Tuval kaydı okunamadı.');
        const next = parsed ?? firstWorkspace(await SecureStore.getItemAsync('cepdesk.dashboard.v1'));
        if (!alive) return; current.current = next; setModel(next); setReady(true);
        if (!parsed && native) save(next);
      } catch { if (alive) setError('Tuval kaydı okunamadı. Veriyi korumak için düzenlemeler kapalı; uygulamayı tekrar açın.'); }
    })();
    return () => { alive = false; };
    // Initialize/migrate once; later writes are serialized by save.
  }, [loadAttempt, save]);
  const update = (change: (model: Workspace) => Workspace) => {
    if (!ready) return;
    const next = change(current.current); if (next === current.current) return;
    current.current = next; setModel(next); save(next);
  };
  const create = () => { const id = `canvas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; update(previous => addCanvas(previous, id)); return id; };
  return <Context.Provider value={{ model, ready, error, update, create, modify: (id, change) => update(previous => changeCanvas(previous, id, change)), select: id => update(previous => previous.canvases.some(canvas => canvas.id === id) ? { ...previous, active: id } : previous), next: direction => update(previous => switchCanvas(previous, direction)), remove: id => update(previous => removeCanvas(previous, id)), retry: () => { if (ready) save(current.current); else setLoadAttempt(value => value + 1); } }}>{children}</Context.Provider>;
}
