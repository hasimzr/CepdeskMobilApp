import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { client } from './client';
import AppIcon from './AppIcon';
import ReorderGrid from './ReorderGrid';
import { useFavorites } from './useFavorites';
import { useRemote } from './useRemote';
export type DesktopApplication = { id: string; name: string; description: string };
type Colors = { surface: string; bg: string; text: string; muted: string; tint: string; accent: string; line: string; danger: string };
export default function ApplicationsPanel({ colors: c }: { colors: Colors }) {
  const [open, setOpen] = useState(false);
  const remote = useRemote<{ applications: DesktopApplication[] }>('applications.list', {}, [], 30000);
  const apps = remote.data?.applications ?? []; const loading = remote.loading;
  const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState('');
  const server = client.info?.server_id ?? ''; const store = useFavorites(server); const { favorites, ready } = store; const favoriteError = store.error;
  const width = useWindowDimensions().width; const insets = useSafeAreaInsets(); const columns = Math.max(2, Math.min(8, Math.floor((Math.min(width, 1100) - 24) / 108)));
  const sheetY = useRef(new Animated.Value(0)).current;
  const close = () => { setOpen(false); sheetY.setValue(0); };
  const dismiss = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => sheetY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => { if (gesture.dy > 90 || gesture.vy > 0.8) { setOpen(false); sheetY.setValue(0); } else Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start(); },
    onPanResponderTerminate: () => Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start(),
  }), [sheetY]);
  const favorite = store.toggle;
  const launch = async (app: DesktopApplication) => {
    if (busy) return; setBusy(app.id); setError(''); setNotice('');
    try { await client.request('applications.launch', { id: app.id }); setNotice(`${app.name} bilgisayarda başlatıldı.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Uygulama açılamadı.'); }
    finally { setBusy(''); }
  };
  const all = apps.filter(app => `${app.name} ${app.description}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  const pinned = favorites.map(id => apps.find(app => app.id === id)).filter((app): app is DesktopApplication => !!app);
  const tile = (app: DesktopApplication, full: boolean, drag?: { onPress: () => void; onLongPress: (event: import('react-native').GestureResponderEvent) => void }) => <View key={app.id} style={[s.tile, { width: full ? `${100 / columns}%` : 88 }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${app.name} bilgisayarda aç`} disabled={!!busy} onPress={drag?.onPress ?? (() => { void launch(app); })} onLongPress={drag?.onLongPress} delayLongPress={450} style={({ pressed }) => [s.launch, { opacity: pressed || (busy && busy !== app.id) ? 0.5 : 1 }]}>
      {busy === app.id ? <View style={{ width: 48, height: 48, justifyContent: 'center' }}><ActivityIndicator color={c.accent} /></View> : <AppIcon id={app.id} name={app.name} size={48} tint={c.tint} color={c.accent} />}
      <Text numberOfLines={2} style={{ color: c.text, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 5 }}>{app.name}</Text>
    </Pressable>
    {full && <Pressable accessibilityRole="button" accessibilityLabel={`${app.name} ${favorites.includes(app.id) ? 'favorilerden çıkar' : 'favorilere ekle'}`} accessibilityState={{ selected: favorites.includes(app.id) }} disabled={!ready} onPress={() => favorite(app.id)} style={[s.star, { backgroundColor: c.surface }]}><Text style={{ color: favorites.includes(app.id) ? '#FFBA52' : c.muted, fontSize: 22 }}>{favorites.includes(app.id) ? '★' : '☆'}</Text></Pressable>}
  </View>;
  return <>
    <View style={s.bar}><Text style={{ color: c.muted, fontSize: 12, flex: 1 }}>{pinned.length ? `${pinned.length} favori · Sıralamak için basılı tut` : 'Favorilerini seç, tek dokunuşla aç.'}</Text><Pressable accessibilityRole="button" onPress={() => { setQuery(''); setOpen(true); }} style={[s.all, { backgroundColor: c.tint }]}><Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>Tüm uygulamalar ↗</Text></Pressable></View>
    {loading && !apps.length ? <ActivityIndicator color={c.accent} /> : <ReorderGrid items={pinned} width={88} onReorder={ids => store.reorder([...ids, ...favorites.filter(id => !ids.includes(id))])} onPress={app => { void launch(app); }} renderItem={(app, drag) => tile(app, false, drag)} />}
    {!!favoriteError && <View style={s.bar}><Text style={{ color: c.danger, fontSize: 12, flex: 1 }}>{favoriteError}</Text>{ready && <Pressable accessibilityRole="button" onPress={store.retry}><Text style={{ color: c.accent }}>Tekrar kaydet</Text></Pressable>}</View>}
    {!!(error || remote.error) && <Text style={{ color: c.danger, fontSize: 12 }}>{error || remote.error}</Text>}{!!notice && !open && <Text accessibilityLiveRegion="polite" style={{ color: c.accent, fontSize: 12 }}>{notice}</Text>}
    <Modal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Uygulama listesini kapat" onPress={close} style={StyleSheet.absoluteFill} />
        <Animated.View accessibilityViewIsModal style={[s.sheet, { backgroundColor: c.surface, paddingBottom: Math.max(12, insets.bottom), transform: [{ translateY: sheetY }] }]}>
          <View {...dismiss.panHandlers} style={s.sheetTop}><View style={[s.grip, { backgroundColor: c.line }]} /><View style={s.bar}><Text style={{ color: c.text, fontSize: 17, fontWeight: '700', flex: 1 }}>Tüm uygulamalar <Text style={{ color: c.muted, fontSize: 12 }}>· {apps.length}</Text></Text><Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={close} style={s.close}><Text style={{ color: c.muted, fontSize: 24 }}>×</Text></Pressable></View></View>
          <TextInput accessibilityLabel="Bilgisayar uygulamalarında ara" placeholder="Uygulama ara…" placeholderTextColor={c.muted} value={query} onChangeText={setQuery} autoCorrect={false} style={[s.search, { color: c.text, backgroundColor: c.bg, borderColor: c.line }]} />
          <Text style={{ color: c.muted, fontSize: 12, marginVertical: 8 }}>Açmak için ikona, favori seçmek için yıldıza dokun.</Text>
          {!!(error || remote.error) && <Text style={{ color: c.danger, fontSize: 12 }}>{error || remote.error}</Text>}{!!notice && <Text accessibilityLiveRegion="polite" style={{ color: c.accent, fontSize: 12 }}>{notice}</Text>}
          <FlatList key={columns} data={all} numColumns={columns} keyExtractor={app => app.id} keyboardShouldPersistTaps="handled" initialNumToRender={24} maxToRenderPerBatch={24} windowSize={5} renderItem={({ item }) => tile(item, true)} contentContainerStyle={{ paddingBottom: 16 }} ListEmptyComponent={<Text style={{ color: c.muted, padding: 20, textAlign: 'center' }}>{loading ? 'Uygulamalar taranıyor…' : query ? 'Uygulama bulunamadı.' : 'Güncel masaüstü servisini başlatın; uygulamalar otomatik taranır.'}</Text>} />
        </Animated.View>
      </View>
    </Modal>
  </>;
}
const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, all: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  tile: { position: 'relative', padding: 6, minHeight: 96 }, launch: { alignItems: 'center', paddingVertical: 4 }, star: { alignSelf: 'center', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  overlay: { flex: 1, backgroundColor: 'rgba(8,10,22,0.64)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { height: '84%', maxWidth: 1100, width: '100%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16 },
  sheetTop: { paddingTop: 10, paddingBottom: 6 }, grip: { width: 40, height: 4, borderRadius: 4, alignSelf: 'center', marginBottom: 6 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 14 },
});
