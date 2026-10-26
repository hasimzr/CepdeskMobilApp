import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { client, type Discovery } from './client';
import type { Clip, Job, Player, SavedCommand, Settings, Spec, WindowInfo } from './types';
import { rerunParams } from './validation';
import Dashboard, { PanelWidthContext } from './Dashboard';
import AppIcon from './AppIcon';
import ApplicationsPanel from './ApplicationsPanel';
import ReorderGrid from './ReorderGrid';
import { useFavorites } from './useFavorites';
import { reconcileOrder } from './reorder';
import ControlSlider from './ControlSlider';
import SystemPanel from './SystemPanel';
import MonitorPanel from './MonitorPanel';
import { TouchpadPanel, KeyboardPanel } from './InputPanels';
import CanvasEditor from './CanvasEditor';
import { useRemote } from './useRemote';
import { CanvasActivity, CanvasForeground } from './CanvasActivity';
import CanvasPager from './CanvasPager';
import { WorkspaceProvider, useWorkspace } from './Workspace';

const palettes = {
  light: { bg: '#F2F3FA', surface: '#FFFFFF', text: '#23253C', muted: '#777B98', line: '#E4E6F2', accent: '#5965D8', tint: '#ECEEFF', danger: '#BF4467', terminal: '#25263E' },
  dark: { bg: '#10111B', surface: '#1A1C2C', text: '#F3F3FC', muted: '#979CB9', line: '#2B2E45', accent: '#A6ADFF', tint: '#292D4D', danger: '#FFA0B9', terminal: '#0D0E18' },
};
type Theme = typeof palettes.light;
const ThemeContext = createContext<Theme>(palettes.light);
const useTheme = () => useContext(ThemeContext);
type Tab = 'dashboard' | 'settings' | 'editor';
const stateNames = { offline: 'Çevrimdışı', connecting: 'Bağlanıyor', pairing: 'Parola doğrulanıyor', connected: 'Bağlı', retrying: 'Yeniden bağlanıyor', error: 'Bağlantı hatası' };
const emptySettings: Settings = { paused: false, max_entries: 500, max_total_bytes: 8388608, max_item_bytes: 65536 };
const errorText = (e: unknown) => e instanceof Error ? e.message : 'İşlem tamamlanamadı.';
const time = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const duration = (us: number) => `${Math.floor(Math.max(0, us) / 60000000)}:${Math.floor(Math.max(0, us) / 1000000 % 60).toString().padStart(2, '0')}`;

function Button({ title, onPress, disabled = false, secondary = false, danger = false, busy = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean; busy?: boolean }) {
  const c = useTheme(); const embedded = useContext(PanelWidthContext) !== null;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.button, embedded && { paddingHorizontal: 9, paddingVertical: 10, minHeight: 42, flexShrink: 1 }, { backgroundColor: secondary ? c.tint : danger ? c.danger : c.accent, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}>
    {busy && <ActivityIndicator size="small" color={secondary ? c.accent : c.surface} />}
    <Text style={{ color: secondary ? c.accent : c.bg, fontWeight: '700', fontSize: embedded ? 12 : 14, flexShrink: 1, textAlign: 'center' }}>{title}</Text>
  </Pressable>;
}
function IconButton({ icon, label, onPress, disabled = false, prominent = false }: { icon: string; label: string; onPress: () => void; disabled?: boolean; prominent?: boolean }) {
  const c = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={{ width: prominent ? 48 : 40, height: prominent ? 48 : 40, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: prominent ? c.accent : c.tint, opacity: disabled ? 0.35 : 1 }}><Text style={{ color: prominent ? c.bg : c.accent, fontSize: 22 }}>{icon}</Text></Pressable>;
}
function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  const c = useTheme(); const embedded = useContext(PanelWidthContext) !== null; return <View style={[s.card, embedded && { padding: 10, borderRadius: 12, gap: 10 }, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}
function Label({ children, muted = false, large = false }: { children: React.ReactNode; muted?: boolean; large?: boolean }) {
  const c = useTheme(); const embedded = useContext(PanelWidthContext) !== null; return <Text style={{ color: muted ? c.muted : c.text, fontSize: large ? (embedded ? 16 : 20) : (embedded ? 12 : 14), lineHeight: large ? (embedded ? 22 : 28) : (embedded ? 18 : 21), fontWeight: large ? '700' : '400' }}>{children}</Text>;
}
function Field({ label, value, onChange, multiline = false, numeric = false, placeholder, secure = false }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; numeric?: boolean; placeholder?: string; secure?: boolean }) {
  const c = useTheme();
  return <View style={s.field}><Label muted>{label}</Label><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted}
    autoCapitalize="none" autoCorrect={false} secureTextEntry={secure} multiline={multiline} keyboardType={numeric ? 'number-pad' : 'default'}
    style={[s.input, { color: c.text, backgroundColor: c.bg, borderColor: c.line }, multiline && { minHeight: 110, textAlignVertical: 'top' }]} /></View>;
}
function Notice({ message, loading = false }: { message: string; loading?: boolean }) {
  return <Card><View style={s.row}>{loading && <ActivityIndicator />}<Label muted>{message}</Label></View></Card>;
}
function Split({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const screenWidth = useWindowDimensions().width; const panelWidth = useContext(PanelWidthContext);
  const tablet = (panelWidth ?? screenWidth) >= 680;
  return <View style={[s.split, { flexDirection: tablet ? 'row' : 'column' }]}><View style={{ flex: tablet ? 1.1 : undefined, gap: 12 }}>{left}</View><View style={{ flex: tablet ? 1 : undefined, gap: 12 }}>{right}</View></View>;
}
function useConnection() { const [, setTick] = useState(0); useEffect(() => client.subscribe(() => setTick(n => n + 1)), []); return client; }
function useAction() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  return { busy, error, run };
}
function ClipboardScreen() {
  const connection = useConnection(); const c = useTheme(); const action = useAction();
  const [query, setQuery] = useState(''); const [search, setSearch] = useState(''); const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Clip[]>([]); const [selected, setSelected] = useState<Clip | null>(null); const [content, setContent] = useState('');
  const remote = useRemote<{ items: Clip[]; has_more: boolean }>('clipboard.list', { query: search, offset }, ['clipboard.changed']);
  const settings = connection.info?.settings ?? emptySettings;
  useEffect(() => { if (query === search) return; const timer = setTimeout(() => { setSearch(query); setOffset(0); setItems([]); }, 250); return () => clearTimeout(timer); }, [query, search]);
  useEffect(() => { if (remote.data) setItems(previous => offset === 0 ? remote.data!.items : [...previous.filter(p => !remote.data!.items.some(v => v.id === p.id)), ...remote.data!.items]); }, [remote.data, offset]);
  useEffect(() => { if (connection.state !== 'connected') { setItems([]); setSelected(null); setContent(''); } }, [connection.state]);
  useEffect(() => client.onEvent(event => { if (event.event === 'clipboard.changed' || event.event === 'resync.required') { setOffset(0); if (selected) void client.request('clipboard.get', { id: selected.id }).catch(() => { setSelected(null); setContent(''); }); } }), [selected]);
  useEffect(() => { let alive = true; setContent(''); if (selected && connection.state === 'connected') client.request<{ content: string }>('clipboard.get', { id: selected.id }).then(v => { if (alive) setContent(v.content); }).catch(() => { if (alive) setContent('Kayıt silinmiş olabilir.'); }); return () => { alive = false; }; }, [selected, connection.state]);
  const select = (clip: Clip) => { setSelected(clip); if (connection.info?.capabilities.desktop.clipboard_write) void action.run(() => client.request('clipboard.select', { id: clip.id })); };
  return <>
    <View style={s.row}><TextInput accessibilityLabel="Pano geçmişinde ara" value={query} onChangeText={setQuery} placeholder="Pano geçmişinde ara…" placeholderTextColor={c.muted} style={[s.input, { flex: 1, minHeight: 40, paddingVertical: 8, color: c.text, borderColor: c.line, backgroundColor: c.bg }]} /><Button secondary title={settings.paused ? 'Sürdür' : 'Duraklat'} busy={action.busy} onPress={() => { void action.run(() => client.request('settings.set', { ...settings, paused: !settings.paused })); }} /></View>
    {!connection.info?.capabilities.desktop.clipboard_watch && <Notice message={`Pano takibi kullanılamıyor. ${connection.info?.capabilities.desktop.reason ?? ''}`} />}
    {!!connection.info?.capabilities.desktop.clipboard_notice && <Notice message={connection.info.capabilities.desktop.clipboard_notice} />}
    {settings.paused && <Notice message="Takip duraklatıldı. Kayıtlı içerikleri kullanmaya devam edebilirsiniz." />}
    {!!(remote.error || action.error) && <Notice message={remote.error || action.error} />}
    <Split left={<>
      {!items.length && <Notice loading={remote.loading} message={remote.loading ? 'Pano geçmişi yükleniyor…' : search ? 'Aramayla eşleşen kayıt yok.' : 'Bilgisayarda kopyaladığınız metinler burada görünür.'} />}
      {items.map(clip => <Pressable key={clip.id} accessibilityRole="button" onPress={() => select(clip)}><Card style={{ borderColor: selected?.id === clip.id ? c.accent : c.line }}>
        <Label muted>{time(clip.created_at)}</Label>
        <Text numberOfLines={3} style={{ color: c.text, lineHeight: 22, fontSize: 15 }}>{clip.preview}</Text>
        
      </Card></Pressable>)}
      {remote.data?.has_more && <Button secondary busy={remote.loading} title="Daha fazla yükle" onPress={() => setOffset(v => v + 50)} />}
    </>} right={<>
      <>{selected && <Card> <><ScrollView nestedScrollEnabled style={{ maxHeight: 360 }}><Text selectable style={{ color: c.text, lineHeight: 24 }}>{content || 'İçerik yükleniyor…'}</Text></ScrollView>
          <View style={s.wrap}><Button title="Panoya yaz" disabled={!connection.info?.capabilities.desktop.clipboard_write} busy={action.busy} onPress={() => { void action.run(() => client.request('clipboard.select', { id: selected.id })); }} />
            <Button secondary title="Üste taşı" disabled={!connection.info?.capabilities.desktop.clipboard_write} busy={action.busy} onPress={() => { void action.run(async () => { await client.request('clipboard.promote', { id: selected.id }); setOffset(0); await remote.refresh(); }); }} />
            <Button secondary danger title="Sil" busy={action.busy} onPress={() => { void action.run(async () => { await client.request('clipboard.delete', { id: selected.id }); setSelected(null); }); }} /></View>
        </></Card>}
      </>
      <Button secondary title="Geçmişi temizle" onPress={() => Alert.alert('Pano geçmişi silinsin mi?', 'Bilgisayarda kayıtlı tüm pano metinleri silinir. Aktif pano değişmez.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Temizle', style: 'destructive', onPress: () => { void action.run(async () => { await client.request('clipboard.clear'); setSelected(null); setOffset(0); }); } }])} />
    </>} />
  </>;
}
function WindowCard({ window, onPress, onClose, disabled, canClose, onLongPress }: { onLongPress?: (event: import('react-native').GestureResponderEvent) => void; window: WindowInfo; onPress: () => void; onClose: () => void; disabled: boolean; canClose: boolean }) {
  const c = useTheme();
  return <View style={{ position: 'relative' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${window.app_name}, ${window.title}`} onPress={onPress} onLongPress={onLongPress} delayLongPress={450} disabled={disabled} style={({ pressed }) => [{ minHeight: 154, padding: 10, paddingTop: 34, paddingBottom: 12, borderWidth: 1, borderRadius: 14, alignItems: 'center', gap: 6, backgroundColor: window.active ? c.tint : c.surface, borderColor: window.active ? c.accent : c.line, opacity: pressed ? 0.6 : 1 }]}>
      <AppIcon id={window.app_id} name={window.app_name || window.app_id} size={50} tint={c.tint} color={c.accent} />
      <Text numberOfLines={1} style={{ color: c.text, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{window.app_name || window.app_id || 'Uygulama'}</Text>
      <Text numberOfLines={2} style={{ color: c.muted, fontSize: 11, lineHeight: 15, textAlign: 'center' }}>{window.title || 'Başlıksız pencere'}</Text>
      {window.active && <View accessibilityLabel="Aktif pencere" style={{ position: 'absolute', bottom: 5, height: 3, width: 22, borderRadius: 3, backgroundColor: c.accent }} />}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${window.app_name} penceresini kapat`} disabled={!canClose} onPress={onClose} style={{ position: 'absolute', right: 0, top: 0, width: 34, height: 34, justifyContent: 'center', alignItems: 'center', opacity: canClose ? 1 : 0.3 }}><Text style={{ color: c.danger, fontSize: 21 }}>×</Text></Pressable>
  </View>;
}
function WindowsScreen() {
  const connection = useConnection(); const action = useAction();
  const remote = useRemote<{ windows: WindowInfo[] }>('windows.list', {}, ['windows.changed']);
  const order = useFavorites(`windows.${connection.info?.server_id ?? ''}`);
  const windows = remote.data?.windows ?? []; const ids = reconcileOrder(order.favorites, windows.map(window => window.id));
  useEffect(() => { if (remote.data && order.ready && (ids.length !== order.favorites.length || ids.some((id, index) => id !== order.favorites[index]))) order.replace(ids); });
  const caps = connection.info?.capabilities.desktop; const screenWidth = useWindowDimensions().width; const panelWidth = useContext(PanelWidthContext); const columns = Math.max(1, Math.min(8, Math.floor(((panelWidth ?? screenWidth) + 8) / 112)));
  return <>
    {!caps?.window_list && <Notice message={`Pencere listeleme desteklenmiyor. ${caps?.reason ?? ''}`} />}
    {caps?.window_list && !caps.window_activate && <Notice message="Pencereler listelenebilir; bu oturum etkinleştirme yeteneğini sunmuyor." />}
    {!!(remote.error || action.error || order.error) && <Notice message={remote.error || action.error || order.error} />}
    {!!order.error && order.ready && <Button secondary title="Sırayı tekrar kaydet" onPress={order.retry} />}
    {remote.loading && !remote.data && <Notice loading message="Pencereler alınıyor…" />}
    {remote.data?.windows.length === 0 && <Notice message="Açık pencere bulunamadı." />}
    <Label muted>Sıralamak için basılı tutup sürükleyin.</Label>
    <ReorderGrid items={ids.map(id => windows.find(window => window.id === id)!).filter(Boolean)} width={((panelWidth ?? screenWidth) - 10 * (columns - 1)) / columns} gap={10} onReorder={order.reorder} onPress={window => { if (caps?.window_activate && !action.busy) void action.run(async () => { await client.request('windows.activate', { id: window.id }); await remote.refresh(); }); }} renderItem={(window, drag) => <WindowCard window={window} onLongPress={drag.onLongPress} canClose={!!caps?.window_close && !action.busy} onClose={() => { void action.run(async () => { await client.request('windows.close', { id: window.id }); await remote.refresh(); }); }} disabled={action.busy} onPress={drag.onPress} />} />
  </>;
}
function MediaScreen() {
  const panelWidth = useContext(PanelWidthContext); const artworkSize = panelWidth !== null && panelWidth < 240 ? 48 : 64;
  const connection = useConnection(); const c = useTheme(); const action = useAction();
  const remote = useRemote<{ players: Player[] }>('media.list', {}, ['media.changed']);
  const [selected, setSelected] = useState(''); const [artwork, setArtwork] = useState<string | null>(null);
  const player = remote.data?.players.find(p => p.id === selected) ?? remote.data?.players[0];
  useEffect(() => { let alive = true; setArtwork(null); if (player?.artwork_available) client.request<{ uri: string }>('media.artwork', { id: player.id }).then(v => { if (alive) setArtwork(v.uri); }).catch(() => {}); return () => { alive = false; }; }, [player?.id, player?.title, player?.album, player?.artwork_available]);
  const control = (name: string, extra: object = {}) => { if (player) void action.run(async () => { await client.request('media.action', { id: player.id, action: name, ...extra }); await remote.refresh(); }); };
  return <>
    {!connection.info?.capabilities.media && <Notice message="Oturum D-Bus bağlantısı kullanılamıyor. MPRIS desteği olan bir oynatıcı açın." />}
    {!!(remote.error || action.error) && <Notice message={remote.error || action.error} />}
    {!player && <Notice loading={remote.loading} message={remote.loading ? 'Oynatıcılar yükleniyor…' : 'Şu anda MPRIS oynatıcısı bulunamadı.'} />}
    <View style={s.wrap}>{remote.data?.players.map(p => <Button key={p.id} title={p.name} secondary={player?.id !== p.id} onPress={() => setSelected(p.id)} />)}</View>
    {player && <>
      <View style={s.row}>{artwork ? <Image source={{ uri: artwork }} resizeMode="contain" style={{ width: artworkSize, height: artworkSize, borderRadius: 12 }} /> : <View style={{ width: artworkSize, height: artworkSize, borderRadius: 12, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.accent, fontSize: 28 }}>♫</Text></View>}<View style={{ flex: 1 }}><Text numberOfLines={2} style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{player.title || 'İsimsiz medya'}</Text><Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, marginTop: 4 }}>{player.artists.join(', ') || player.name}</Text></View></View>
      <ControlSlider key={`${player.id}:${player.track_id}`} value={player.length_us > 0 ? player.position_us / player.length_us : 0} label="Medya ilerleme konumu" disabled={!player.can_control || !player.can_seek || player.length_us <= 0 || action.busy} color={c.accent} track={c.line} onCommit={fraction => control('position', { position_us: Math.round(fraction * player.length_us), track_id: player.track_id })} />
      <View style={s.rowBetween}><Label muted>{duration(player.position_us)}</Label><Label muted>{duration(player.length_us)}</Label></View>
      <View style={[s.wrap, { justifyContent: 'center' }]}>
        <IconButton icon="⏮" label="Önceki" disabled={!player.can_control || !player.can_previous || action.busy} onPress={() => control('previous')} />
        <IconButton icon="↶" label="10 saniye geri" disabled={!player.can_control || !player.can_seek || action.busy} onPress={() => control('seek', { offset_us: -10000000 })} />
        <IconButton icon={player.status === 'Playing' ? '⏸' : '▶'} label={player.status === 'Playing' ? 'Duraklat' : 'Oynat'} prominent disabled={!player.can_control || action.busy || (player.status === 'Playing' ? !player.can_pause : !player.can_play)} onPress={() => control(player.status === 'Playing' ? 'pause' : 'play')} />
        <IconButton icon="↷" label="10 saniye ileri" disabled={!player.can_control || !player.can_seek || action.busy} onPress={() => control('seek', { offset_us: 10000000 })} />
        <IconButton icon="⏭" label="Sonraki" disabled={!player.can_control || !player.can_next || action.busy} onPress={() => control('next')} />
      </View>
      {player.volume !== null && <View style={s.row}><IconButton icon="−" label="Oynatıcı sesini azalt" disabled={!player.can_control || action.busy} onPress={() => control('volume', { volume: Math.max(0, player.volume! - 0.05) })} /><View style={{ flex: 1 }}><ControlSlider label="Oynatıcı sesi" value={player.volume} disabled={!player.can_control || action.busy} color={c.accent} track={c.line} onCommit={volume => control('volume', { volume })} /></View><IconButton icon="+" label="Oynatıcı sesini artır" disabled={!player.can_control || action.busy} onPress={() => control('volume', { volume: Math.min(1, player.volume! + 0.05) })} /></View>}
    </>}

  </>;
}
const jobNames: Record<string, string> = { running: 'Çalışıyor', finished: 'Tamamlandı', cancelled: 'İptal edildi', timed_out: 'Zaman aşımı', failed: 'Başlatılamadı', interrupted: 'Servis yeniden başladı', output_limit: 'Çıktı sınırında durduruldu' };
function CommandsScreen() {
  const connection = useConnection(); const c = useTheme(); const action = useAction();
  const saved = useRemote<{ commands: SavedCommand[] }>('commands.list', {}, ['commands.changed']);
  const jobs = useRemote<{ jobs: Job[] }>('jobs.list', {}, ['job.changed']);
  const [selected, setSelected] = useState(''); const [detail, setDetail] = useState<Job | null>(null); const [compose, setCompose] = useState(false);
  const [command, setCommand] = useState(''); const [shell, setShell] = useState('/bin/bash'); const [cwd, setCwd] = useState('/tmp'); const [timeout, setTimeoutValue] = useState('60'); const [name, setName] = useState(''); const [editing, setEditing] = useState('');
  const free = connection.info?.capabilities.free_commands;
  const [keepHistory, setKeepHistory] = useState(false); const [answer, setAnswer] = useState(''); const [secret, setSecret] = useState(false);
  const terminalScroll = useRef<ScrollView>(null); const inputRef = useRef<TextInput>(null); const [inputBusy, setInputBusy] = useState(false); const [inputError, setInputError] = useState('');
  const interactive = connection.info?.capabilities.interactive_commands;
  const jobDetail = useRemote<Job>('jobs.get', { id: selected }, [], selected ? 500 : 0);
  useEffect(() => { if (jobDetail.data) setDetail(jobDetail.data); if (!selected) setDetail(null); }, [jobDetail.data, selected]);
  const spec: Spec = { command, shell, cwd, timeout_seconds: Number(timeout) };
  const run = (params: object) => { if (action.busy) return; void action.run(async () => { const job = await client.request<Job>('commands.run', { ...params, keep_history: keepHistory }); setAnswer(''); setInputError(''); setSelected(job.id); setDetail(job); await jobs.refresh(); }); };
  useEffect(() => { setAnswer(''); setInputError(''); setSecret(false); }, [selected]);
  const sendInput = async (data: string) => {
    if (!detail || detail.status !== 'running' || inputBusy) return;
    setInputBusy(true); setInputError('');
    try { await client.request('jobs.input', { id: detail.id, data }); setAnswer(''); inputRef.current?.focus(); }
    catch (error) { setInputError(errorText(error)); } finally { setInputBusy(false); }
  };
  const edit = (saved: SavedCommand) => { setCompose(true); setEditing(saved.id); setName(saved.name); setCommand(saved.command); setShell(saved.shell); setCwd(saved.cwd); setTimeoutValue(String(saved.timeout_seconds)); };
  return <>
    {!!(action.error || inputError || saved.error || jobs.error) && <Notice message={action.error || inputError || saved.error || jobs.error} />}
    <View style={s.row}><Switch accessibilityLabel="Çalıştırılan komutları geçmişe kaydet" value={keepHistory} onValueChange={setKeepHistory} /><Label muted>Çalıştırılan komutları geçmişe kaydet</Label></View>
    <Split left={<>
      <Card>{saved.loading && !saved.data && <ActivityIndicator />}{saved.data?.commands.length === 0 && <Label muted>Henüz kayıtlı komut yok.</Label>}
        {saved.data?.commands.map(item => <View key={item.id} style={[s.savedRow, { borderColor: c.line }]}><Label large>{item.name}</Label><Label muted>{item.shell} · {item.cwd} · {item.timeout_seconds} sn</Label>
          <View style={s.wrap}><Button title="Çalıştır" busy={action.busy} onPress={() => run({ saved_id: item.id })} />{free && <><Button secondary title="Düzenle" onPress={() => edit(item)} /><Button secondary title="Sil" busy={action.busy} onPress={() => { void action.run(async () => { await client.request('commands.delete', { id: item.id }); await saved.refresh(); if (editing === item.id) { setEditing(''); setCompose(false); } }); }} /></>}</View>
        </View>)}
      </Card>
      <Button secondary title={compose ? 'İptal' : '+ Komut ekle'} disabled={!free} onPress={() => { setEditing(''); setName(''); setCommand(''); setCompose(value => !value); }} />
      {!free && <Label muted>Komut eklemek için bilgisayarda bu cihaza serbest komut yetkisi verin: cepdesk permission {connection.credentials?.device.id} on</Label>}
      {free && compose && <Card><Field label="Komut adı" value={name} onChange={setName} placeholder="Örn. Projeyi başlat" />
        {!free ? <Label muted>Bu cihazın serbest komut yetkisi kapalı. Bilgisayarda “cepdesk permission CİHAZ_ID on” ile açıkça etkinleştirin.</Label> : <>
          <Field label="Komut" multiline value={command} onChange={setCommand} placeholder="Örn. git status --short" /><Field label="Shell (mutlak yol)" value={shell} onChange={setShell} /><Field label="Çalışma dizini (mutlak yol)" value={cwd} onChange={setCwd} /><Field label="Zaman aşımı (saniye)" numeric value={timeout} onChange={setTimeoutValue} />
          <Button title="Komutu çalıştır" busy={action.busy} disabled={!command} onPress={() => run(spec)} />
          <Button secondary title={editing ? 'Değişiklikleri kaydet' : 'Kayıtlı komut ekle'} busy={action.busy} disabled={!command || !name} onPress={() => { void action.run(async () => { await client.request('commands.save', { ...spec, id: editing, name }); setEditing(''); setName(''); setCompose(false); await saved.refresh(); }); }} />
          {editing && <Button secondary title="Düzenlemeden çık" onPress={() => { setEditing(''); setName(''); }} />}
        </>}
      </Card>}
    </>} right={<>
      {detail && <Card>{detail ? <>
        <Label>{jobNames[detail.status] ?? detail.status} · {detail.exit_code === null ? 'Çıkış kodu yok' : `Çıkış: ${detail.exit_code}`}</Label><Label muted>{detail.spec.shell} · {detail.spec.cwd}</Label>
        <ScrollView ref={terminalScroll} onContentSizeChange={() => terminalScroll.current?.scrollToEnd({ animated: false })} nestedScrollEnabled style={[s.terminal, { backgroundColor: c.terminal }]}><Text selectable style={s.terminalText}>{detail.stdout || (detail.status === 'running' ? 'Çıktı bekleniyor…' : '(stdout boş)')}</Text>{!!detail.stderr && <Text selectable style={[s.terminalText, { color: '#FFABB4' }]}>{detail.stderr}</Text>}</ScrollView>
        {detail.output_truncated && <Label muted>Çıktı 128 KiB sınırında kesildi. Çıktı sınırını aşan komutlar otomatik durdurulur.</Label>}
        {detail.status === 'running' && interactive && <>
          <View style={s.row}><Label muted>Terminal yanıtı</Label><Switch accessibilityLabel="Parolayı gizle" value={secret} onValueChange={setSecret} /><Label muted>Parolayı gizle</Label></View>
          <TextInput ref={inputRef} accessibilityLabel="Terminale yaz" placeholder="Yanıtı yazıp gönderin…" placeholderTextColor={c.muted} value={answer} onChangeText={setAnswer} secureTextEntry={secret} autoCapitalize="none" autoCorrect={false} returnKeyType="send" blurOnSubmit={false} onSubmitEditing={() => { void sendInput(`${answer}\n`); }} style={[s.input, { color: c.text, backgroundColor: c.bg, borderColor: c.line }]} />
          <View style={s.wrap}><Button title="Gönder ↵" busy={inputBusy} onPress={() => { void sendInput(`${answer}\n`); }} /><Button secondary title="Ctrl+C" busy={inputBusy} onPress={() => { void sendInput('\u0003'); }} /><Button secondary title="Ctrl+D" busy={inputBusy} onPress={() => { void sendInput('\u0004'); }} /></View>
        </>}
        <View style={s.wrap}>{detail.status === 'running' && <Button danger title="İşi iptal et" busy={action.busy} onPress={() => { void action.run(async () => { await client.request('jobs.cancel', { id: detail.id }); await jobDetail.refresh(); }); }} />}<Button secondary title="Yeniden çalıştır" busy={action.busy} disabled={detail.status === 'running' || (!free && !detail.spec.saved_id)} onPress={() => run(rerunParams(detail.spec))} />{detail.status !== 'running' && <><Button secondary title="Komutu düzenle" disabled={!free} onPress={() => { if (detail.spec.saved_id) { const item = saved.data?.commands.find(item => item.id === detail.spec.saved_id); if (item) { edit(item); return; } } setCompose(true); setEditing(''); setName(''); setCommand(detail.spec.command); setShell(detail.spec.shell); setCwd(detail.spec.cwd); setTimeoutValue(String(detail.spec.timeout_seconds)); }} /><Button secondary title="Geçmişten sil" busy={action.busy} onPress={() => { void action.run(async () => { await client.request('jobs.delete', { id: detail.id }); setSelected(''); setDetail(null); await jobs.refresh(); }); }} /></>}</View>
      </> : <Label muted>Çıktıyı görmek için bir komut çalıştırın.</Label>}</Card>}
      {!!jobs.data?.jobs.length && <Card>{jobs.data?.jobs.length === 0 && <Label muted>Henüz çalıştırılmış komut yok.</Label>}
        {jobs.data?.jobs.map(job => <Pressable key={job.id} onPress={() => setSelected(job.id)} style={[s.savedRow, { borderColor: c.line }]}><Text numberOfLines={1} style={{ color: selected === job.id ? c.accent : c.text, fontWeight: '600' }}>{job.spec.command}</Text><Label muted>{jobNames[job.status]} · {time(job.created_at)}</Label></Pressable>)}
      </Card>}
    </>} />
  </>;
}
function SettingsScreen({ theme, setTheme, onOpenCanvas }: { theme: string; setTheme: (v: 'system' | 'light' | 'dark') => void; onOpenCanvas: () => void }) {
  const connection = useConnection(); const action = useAction();
  const [host, setHost] = useState(connection.credentials?.host ?? ''); const [port, setPort] = useState(String(connection.credentials?.port ?? 43821)); const [password, setPassword] = useState(''); const [name, setName] = useState('Android cihazım');
  const [services, setServices] = useState<Discovery[]>([]); const [discovery, setDiscovery] = useState(''); const stop = useRef<(() => void) | null>(null);
  const settings = connection.info?.settings ?? emptySettings;
  const [entries, setEntries] = useState(String(settings.max_entries)); const [total, setTotal] = useState(String(settings.max_total_bytes / 1024)); const [item, setItem] = useState(String(settings.max_item_bytes / 1024));
  useEffect(() => { setEntries(String(settings.max_entries)); setTotal(String(settings.max_total_bytes / 1024)); setItem(String(settings.max_item_bytes / 1024)); }, [settings.max_entries, settings.max_total_bytes, settings.max_item_bytes]);
  const scan = () => {
    stop.current?.(); setServices([]); setDiscovery('Yerel ağ taranıyor…');
    let selected = Boolean(host);
    try { stop.current = client.discover(service => {
      if (service.state === 'found') { if (!selected && service.host) { selected = true; setHost(service.host); setPort(String(service.port ?? 43821)); } setServices(previous => [...previous.filter(v => v.name !== service.name), service]); setDiscovery('Bulunan bilgisayarlardan birini seçin.'); }
      else if (service.state === 'lost') setServices(previous => previous.filter(v => v.name !== service.name));
      else if (service.state === 'error' || service.state === 'resolve_failed') setDiscovery('Keşif tamamlanamadı; IP ve port ile bağlanabilirsiniz.');
    }); } catch (e) { setDiscovery(errorText(e)); }
  };
  useEffect(() => {
    if (connection.nativeAvailable && !connection.credentials) scan();
    return () => { stop.current?.(); };
    // Scan once when this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <><Label large>Ayarlar</Label><Card><Label large>Tuvaller</Label><Button title="Tuval editörünü aç" onPress={onOpenCanvas} /></Card><Split left={<>
    <Card><Label large>{connection.credentials ? 'Eşleştirilmiş bilgisayar' : 'Bilgisayarını bağla'}</Label><Label muted>Aynı yerel ağda çalışır. Hesap veya internet gerekmez.</Label>
      {!connection.nativeAvailable && <Notice message="Expo Go yerine native TLS ve NSD modülünü içeren Expo development build / APK kurun." />}
      <Button secondary title="Bilgisayarları bul" onPress={scan} />{!!discovery && <Label muted>{discovery}</Label>}
      {services.map(service => <Button key={service.name} secondary title={`${service.name} · ${service.host}`} onPress={() => { setHost(service.host ?? ''); setPort(String(service.port ?? 43821)); }} />)}
      <Field label="Bilgisayar IPv4 adresi" value={host} onChange={setHost} placeholder="192.168.1.20" /><Field label="Port" value={port} onChange={setPort} numeric />
      {connection.credentials ? <>
        <Label muted>Bu cihaz kayıtlı. Uygulamayı açtığınızda otomatik bağlanır.</Label>
        <Button title="Adresi güncelle ve bağlan" busy={action.busy} onPress={() => { void action.run(() => client.changeAddress(host, Number(port))); }} />
        <Button secondary title="Yeniden bağlan" onPress={() => client.retry()} />
        <Button secondary title="Bu telefondaki eşleşmeyi unut" onPress={() => Alert.alert('Eşleşme unutulsun mu?', 'Telefondaki anahtar silinir. Bilgisayardaki yetkiyi ayrıca cepdesk revoke ile iptal edin.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Unut', style: 'destructive', onPress: () => { void action.run(() => client.forget()); } }])} />
      </> : <>
        <Label muted>Bilgisayarda servisi başlatırken belirlediğiniz parolayı girin. Diğer telefon ve tabletlerde de aynı parolayı kullanabilirsiniz. Bu cihaz sonraki açılışlarda otomatik bağlanır.</Label>
        <Field label="Bağlantı parolası" secure value={password} onChange={setPassword} placeholder="Bilgisayarda belirlediğiniz parola" /><Field label="Bu cihazın adı" value={name} onChange={setName} />
        <Button title={connection.state === 'pairing' ? 'Parola doğrulanıyor…' : 'Bağlan ve hatırla'} busy={action.busy} disabled={!host || [...password].length < 12 || !name.trim()} onPress={() => { void action.run(async () => { const entered = password; setPassword(''); stop.current?.(); stop.current = null; await client.pair(host, Number(port), entered, name); }); }} />
      </>}
      {!!(action.error || connection.error) && <Label muted>{action.error || connection.error}</Label>}
    </Card>
  </>} right={<>
    <Card><Label large>Görünüm</Label><View style={s.wrap}>{(['system', 'light', 'dark'] as const).map(value => <Button key={value} title={{ system: 'Sistem', light: 'Açık', dark: 'Koyu' }[value]} secondary={theme !== value} onPress={() => setTheme(value)} />)}</View></Card>
    <Card><Label large>Pano sınırları</Label><Label muted>Bilgisayarda kalıcıdır. Yalnızca UTF-8 metin desteklenir. Hassas işaretler dikkate alınır; her parolanın otomatik tanınacağı garanti edilmez.</Label>
      <View style={s.rowBetween}><Label>Takibi duraklat</Label><Switch accessibilityLabel="Pano takibini duraklat" value={settings.paused} disabled={connection.state !== 'connected'} onValueChange={paused => { void action.run(() => client.request('settings.set', { ...settings, paused })); }} /></View>
      <Field label="Maksimum kayıt (1–5000)" numeric value={entries} onChange={setEntries} /><Field label="Toplam depolama (KiB, en fazla 65536)" numeric value={total} onChange={setTotal} /><Field label="Tek içerik (KiB, en fazla 64)" numeric value={item} onChange={setItem} />
      <Button title="Sınırları kaydet" busy={action.busy} disabled={connection.state !== 'connected'} onPress={() => { void action.run(() => client.request('settings.set', { ...settings, max_entries: Number(entries), max_total_bytes: Number(total) * 1024, max_item_bytes: Number(item) * 1024 })); }} />
    </Card>
    <Card><Label large>Oturum yetenekleri</Label>{connection.info ? <>
      <Label>Pano takibi: {connection.info.capabilities.desktop.clipboard_watch ? 'Açık' : 'Desteklenmiyor'}</Label><Label>Pano yazma: {connection.info.capabilities.desktop.clipboard_write ? 'Açık' : 'Desteklenmiyor'}</Label>
      <Label>Pencere listesi: {connection.info.capabilities.desktop.window_list ? 'Açık' : 'Desteklenmiyor'}</Label><Label>Pencere etkinleştirme: {connection.info.capabilities.desktop.window_activate ? 'Açık' : 'Desteklenmiyor'}</Label>
      <Label>MPRIS: {connection.info.capabilities.media ? 'Erişilebilir' : 'Erişilemiyor'}</Label><Label>Serbest komut: {connection.info.capabilities.free_commands ? 'Yetkili' : 'Yetkisiz'}</Label>
    </> : <Label muted>Bilgisayara bağlanınca gerçek oturum yetenekleri burada gösterilir.</Label>}</Card>
  </>} /></>;
}
function Root() {
  const workspace = useWorkspace();
  const canvas = workspace.model.canvases.find(item => item.id === workspace.model.active) ?? workspace.model.canvases[0]!;
  const canvasIndex = workspace.model.canvases.findIndex(item => item.id === canvas.id);
  const connection = useConnection(); const system = useColorScheme(); const width = useWindowDimensions().width; const tablet = width >= 840;
  const [theme, setThemeState] = useState<'system' | 'light' | 'dark'>('system');  const [tab, setTab] = useState<Tab>('dashboard');
  useEffect(() => { void client.restore(); void SecureStore.getItemAsync('cepdesk.theme').then(value => { if (value === 'light' || value === 'dark') setThemeState(value); }); }, []);
  const setTheme = (value: 'system' | 'light' | 'dark') => { setThemeState(value); void SecureStore.setItemAsync('cepdesk.theme', value); };
  const dark = theme === 'system' ? system === 'dark' : theme === 'dark'; const c = dark ? palettes.dark : palettes.light;
  const renderPanel = (id: import('./dashboard-layout').PanelId) => id === 'monitor' ? <MonitorPanel colors={c} /> : id === 'touchpad' ? <TouchpadPanel colors={c} /> : id === 'keyboard' ? <KeyboardPanel colors={c} /> : id === 'system' ? <SystemPanel colors={c} /> : id === 'applications' ? <ApplicationsPanel colors={c} /> : id === 'clipboard' ? <ClipboardScreen /> : id === 'windows' ? <WindowsScreen /> : id === 'media' ? <MediaScreen /> : <CommandsScreen />;
  const connected = connection.state === 'connected';
  return <ThemeContext.Provider value={c}><SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right', 'bottom']}><StatusBar style={dark ? 'light' : 'dark'} />
    <View style={[s.header, { borderColor: c.line }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Çalışma alanına dön" onPress={() => setTab('dashboard')} style={s.headerButton}><Text style={{ color: c.accent, fontSize: 18, fontWeight: '800' }}>{tab !== 'dashboard' ? '←' : '◈'}</Text></Pressable>
      {tab === 'dashboard' ? <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Önceki tuval" disabled={!workspace.ready || canvasIndex <= 0} onPress={() => workspace.next(-1)} style={{ width: 26, height: 36, alignItems: 'center', justifyContent: 'center', opacity: canvasIndex <= 0 ? 0.25 : 1 }}><Text style={{ color: c.accent, fontSize: 23 }}>‹</Text></Pressable>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: 12, flex: 1, textAlign: 'center' }}>{canvas.name} · {canvasIndex + 1}/{workspace.model.canvases.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Sonraki tuval" disabled={!workspace.ready || canvasIndex >= workspace.model.canvases.length - 1} onPress={() => workspace.next(1)} style={{ width: 26, height: 36, alignItems: 'center', justifyContent: 'center', opacity: canvasIndex >= workspace.model.canvases.length - 1 ? 0.25 : 1 }}><Text style={{ color: c.accent, fontSize: 23 }}>›</Text></Pressable>
      </View> : <View style={{ flex: 1 }} />}
      {connection.phoneAudioActive && <Pressable accessibilityRole="button" accessibilityLabel="Telefon hoparlörünü durdur" onPress={() => { void client.stopPhoneAudio().catch(() => {}); }} style={s.headerButton}><Text style={{ color: c.accent }}>🔊</Text></Pressable>}
      {tab === 'dashboard' && <Pressable accessibilityRole="button" accessibilityLabel="Tuval editörünü aç" disabled={!workspace.ready} onPress={() => { Keyboard.dismiss(); setTab('editor'); }} style={s.headerButton}><Text style={{ color: c.accent, fontSize: 13, fontWeight: '600' }}>Düzenle</Text></Pressable>}

      <Pressable accessibilityRole="button" accessibilityLabel="Tuval, bağlantı ve tema ayarları" onPress={() => setTab(tab === 'settings' ? 'dashboard' : 'settings')} style={[s.status, { backgroundColor: c.tint }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: connected ? c.accent : c.muted }} /><Text style={{ color: c.accent, fontSize: 12, fontWeight: '600' }}>{stateNames[connection.state]}</Text><Text style={{ color: c.accent, fontSize: 16 }}>⚙</Text></Pressable>
    </View>
    <View style={{ flex: 1, flexDirection: 'row' }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {connected && <View style={{ flex: 1, display: tab === 'dashboard' ? 'flex' : 'none' }}><CanvasPager canvases={workspace.model.canvases} active={workspace.model.active} disabled={tab !== 'dashboard' || !workspace.ready} onSelect={id => { Keyboard.dismiss(); workspace.select(id); }} renderCanvas={item => <CanvasActivity.Provider value={tab === 'dashboard' && Math.abs(workspace.model.canvases.findIndex(other => other.id === item.id) - canvasIndex) <= 1}><CanvasForeground.Provider value={tab === 'dashboard' && item.id === workspace.model.active}><Dashboard layout={item.layout} onChange={layout => workspace.modify(item.id, previous => ({ ...previous, layout }))} onConfigure={() => setTab('editor')} colors={c} editing={false} onEditingChange={() => {}} renderPanel={renderPanel} /></CanvasForeground.Provider></CanvasActivity.Provider>} /></View>}
      {tab === 'editor' && <CanvasEditor colors={c} onClose={() => { Keyboard.dismiss(); setTab('dashboard'); }} renderPanel={renderPanel} />}
      {tab === 'dashboard' && !connected && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}><Label large>Bilgisayarınızla bağlantı kurun</Label><Notice loading={connection.state === 'connecting' || connection.state === 'retrying'} message={connection.error || 'Bilgisayarınıza bağlanın; pano, pencereler, medya ve komutlar tek çalışma alanında görünsün.'} /><Button title="Bağlantı ayarlarını aç" onPress={() => setTab('settings')} />{connection.credentials && <Button secondary title="Şimdi yeniden dene" onPress={() => connection.retry()} />}</ScrollView>}
      {tab === 'settings' && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, tablet && { padding: 28 }]}><SettingsScreen theme={theme} setTheme={setTheme} onOpenCanvas={() => { Keyboard.dismiss(); setTab('editor'); }} /></ScrollView>}
    </KeyboardAvoidingView></View>
  </SafeAreaView></ThemeContext.Provider>;
}
export default function App() { return <SafeAreaProvider><WorkspaceProvider><Root /></WorkspaceProvider></SafeAreaProvider>; }
const s = StyleSheet.create({
  header: { paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderBottomWidth: 1 },
  headerButton: { minWidth: 40, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 10 },
  windowRow: { padding: 9, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 66 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  content: { padding: 18, gap: 16, paddingBottom: 36, maxWidth: 1500, width: '100%', alignSelf: 'center' },
  card: { padding: 18, borderRadius: 18, borderWidth: 1, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }, split: { gap: 18, alignItems: 'stretch' },
  button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  field: { gap: 7 }, input: { borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 13, paddingVertical: 12, fontSize: 15 },
  overline: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, appIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cover: { width: 230, height: 230, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  terminal: { padding: 14, borderRadius: 12, minHeight: 140, maxHeight: 500 }, terminalText: { fontFamily: 'monospace', color: '#E2E3FF', fontSize: 12, lineHeight: 19 },
  savedRow: { gap: 10, paddingVertical: 13, borderTopWidth: 1 },
});
