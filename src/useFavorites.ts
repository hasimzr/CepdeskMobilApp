import { useMemo, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';
import { parseFavorites, toggleFavorite } from './favorites';
import { layoutWriter } from './layout-storage';
type Snapshot = { ids: string[]; ready: boolean; error: string };
const entries = new Map<string, ReturnType<typeof create>>();
function create(key: string) {
  let snapshot: Snapshot = { ids: [], ready: false, error: '' }; const listeners = new Set<() => void>();
  const update = (next: Snapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  const writer = layoutWriter<string[]>(raw => SecureStore.setItemAsync(key, raw)); let revision = 0;
  const save = () => { const current = ++revision; void writer(snapshot.ids).then(() => { if (revision === current) update({ ...snapshot, error: '' }); }).catch(() => { if (revision === current) update({ ...snapshot, error: 'Favoriler kaydedilemedi. Tekrar kaydetmeyi deneyin.' }); }); };
  void SecureStore.getItemAsync(key).then(raw => update({ ids: parseFavorites(raw), ready: true, error: '' })).catch(() => update({ ...snapshot, error: 'Favoriler okunamadı.' }));
  return { get: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, replace: (ids: string[]) => { if (!snapshot.ready) return; update({ ...snapshot, ids: parseFavorites(JSON.stringify(ids)) }); save(); }, reorder: (ids: string[]) => { if (!snapshot.ready) return; const valid = parseFavorites(JSON.stringify(ids)); if (valid.length !== snapshot.ids.length || valid.some(id => !snapshot.ids.includes(id))) return; update({ ...snapshot, ids: valid }); save(); }, toggle: (id: string) => { if (!snapshot.ready) return; update({ ...snapshot, ids: toggleFavorite(snapshot.ids, id) }); save(); }, save };
}
export function useFavorites(server: string) {
  const entry = useMemo(() => { const key = `cepdesk.favorites.${server}`; let store = entries.get(key); if (!store) { store = create(key); entries.set(key, store); } return store; }, [server]);
  const snapshot = useSyncExternalStore(entry.subscribe, entry.get);
  return { favorites: snapshot.ids, ready: snapshot.ready, error: snapshot.error, toggle: entry.toggle, reorder: entry.reorder, replace: entry.replace, retry: entry.save };
}
