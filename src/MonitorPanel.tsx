import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PanelSizeContext } from './Dashboard';
import { CanvasForeground } from './CanvasActivity';
import { InputHost } from './CanvasPager';
import { useInputTouch } from './input-touch';
import { client, type MonitorFrame } from './client';
import { requireNativeViewManager } from 'expo-modules-core';
type Colors = { bg: string; surface: string; text: string; muted: string; accent: string; tint: string; line: string };
type Frame = MonitorFrame;
const NativeMonitor = requireNativeViewManager<{ streamId: string; style: { width: '100%'; height: '100%' } }>('CepDeskNative','MonitorView');
export default function MonitorPanel({ colors: c }: { colors: Colors }) {
  const size = useContext(PanelSizeContext); const foreground = useContext(CanvasForeground);
  const [frame, setFrame] = useState<Frame | null>(null); const [fps, setFps] = useState(0); const [sourceFps, setSourceFps] = useState(0); const received = useRef({ count: 0, at: Date.now() }); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [fullscreen, setFullscreen] = useState(false);
  const stream = useRef<Frame | null>(null); const revision = useRef(0); const starting = useRef(false); const scroll = useRef({ x: 0, y: 0, dx: 0, dy: 0 }); const scrollBusy = useRef(false);
  const stop = () => {
    revision.current++; starting.current = false; const previous = stream.current; stream.current = null; setFrame(null); setBusy(false); scroll.current = { x: 0, y: 0, dx: 0, dy: 0 };
    if (previous) client.clearMonitorFrame(previous.stream_id);
    setFps(0); setSourceFps(0);
    if (previous && client.state === 'connected') void client.request('monitor.stop', { stream_id: previous.stream_id }).catch(() => {});
  };
  const start = async (mode: 'screen' | 'window') => {
    if (starting.current) return; stop(); starting.current = true; const current = ++revision.current; setBusy(true); setError('');
    try {
      const next = await client.request<Frame>('monitor.start', { mode, binary: true, codec: 'h264' });
      if (revision.current !== current) { if (client.state === 'connected') void client.request('monitor.stop', { stream_id: next.stream_id }).catch(() => {}); return; }
      stream.current = next; received.current = { count: 0, at: Date.now() }; setFrame(next);
    } catch (e) { if (revision.current === current) setError(e instanceof Error ? e.message : 'Yayın başlatılamadı.'); }
    finally { if (revision.current === current) { starting.current = false; setBusy(false); } }
  };
  const send = (method: string, params: object) => {
    const current = stream.current; if (!current || !current.touch) return;
    void client.request(method, { stream_id: current.stream_id, source_id: current.source_id, ...params }).catch(e => setError(e instanceof Error ? e.message : 'Dokunma gönderilemedi.'));
  };
  const surface = useInputTouch(event => {
    if (!foreground) return;
    if (event.action === 'key' && event.down) {
      if (event.code === -1) void start('screen');
      else if (event.code === -2) void start('window');
      else if (event.code === -3) setFullscreen(value => !value);
      else if (event.code === -4) stop();
    } else if (event.action === 'monitor.tap') send('monitor.click', { x: event.x, y: event.y });
    else if (event.action === 'monitor.scroll') { scroll.current.x = event.x ?? 0; scroll.current.y = event.y ?? 0; scroll.current.dx += (event.dx ?? 0) / 24; scroll.current.dy += (event.dy ?? 0) / 24; }
  });
  useEffect(() => {
    if (!foreground) { stop(); setFullscreen(false); }
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') { stop(); setFullscreen(false); } });
    return () => { sub.remove(); stop(); };
    // Capture is explicit: returning to the canvas shows the source picker again.
  }, [foreground]);
  useEffect(() => client.onMonitorFrame(next => {
    if (next.stream_id !== stream.current?.stream_id) return;
    if (next.error) { setError(next.error); return; }
    setError('');
    if (next.source_id !== stream.current.source_id) { scroll.current = { x: 0, y: 0, dx: 0, dy: 0 }; setError(''); }
    stream.current = next;
    setFrame(previous => previous?.stream_id === next.stream_id && previous.width === next.width && previous.height === next.height && previous.title === next.title && previous.touch === next.touch && previous.source_id === next.source_id ? previous : next);
    const stats = received.current; stats.count++;
    const elapsed = Date.now() - stats.at;
    if (elapsed >= 1000) { setFps(Math.round(stats.count * 1000 / elapsed)); setSourceFps(next.capture_fps ?? 0); received.current = { count: 0, at: Date.now() }; }
  }), []);
  useEffect(() => {
    if (!frame?.stream_id || !foreground) return;
    let alive = true;
    const heartbeat = setInterval(() => {
      void client.request('monitor.keepalive', { stream_id: frame.stream_id }).catch(e => { if (alive) { stop(); setError(e instanceof Error ? e.message : 'Yayın durdu.'); } });
    }, 3000);
    const off = client.onEvent(event => { if (event.event === 'monitor.stopped') { stop(); setError((event.data as { message?: string }).message || 'Yayın durdu.'); } });
    return () => { alive = false; clearInterval(heartbeat); off(); };
  }, [frame?.stream_id, foreground]);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = stream.current; if (!current?.touch || scrollBusy.current) return;
      const p = scroll.current; const dx = Math.trunc(p.dx); const dy = Math.trunc(p.dy); if (!dx && !dy) return;
      p.dx -= dx; p.dy -= dy; scrollBusy.current = true;
      void client.request('monitor.scroll', { stream_id: current.stream_id, source_id: current.source_id, x: p.x, y: p.y, dx, dy }).catch(e => setError(e instanceof Error ? e.message : 'Kaydırma gönderilemedi.')).finally(() => { scrollBusy.current = false; });
    }, 60);
    return () => clearInterval(timer);
  }, []);
  const action = (label: string, code: number, press: () => void, disabled = false) => <Pressable nativeID={`cepdesk-key:${surface}:${code}`} collapsable={false} accessibilityRole="button" disabled={disabled} onPress={press} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.tint, opacity: disabled ? .5 : 1 }}><Text style={{ color: c.accent, fontSize: 12 }}>{label}</Text></Pressable>;
  const content = (expanded: boolean) => <View nativeID={`cepdesk-surface:${surface}`} collapsable={false} style={{ flex: 1, padding: expanded ? 12 : 0, gap: 7, backgroundColor: c.surface }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '600' }}>{frame ? `${frame.mode === 'screen' ? 'Ekran' : 'Uygulama'} · ${frame.title}` : 'Monitör'}</Text>{frame && action('Durdur', -4, stop)}{action(expanded ? '↙ Küçült' : '⛶ Tam ekran', -3, () => setFullscreen(value => !value))}</View>
    {!!error && <Text style={{ color: c.muted, fontSize: 11 }}>{error}</Text>}
    {frame ? <>
      <MonitorImage frame={frame} surface={surface} />
      <Text style={{ color: c.muted, fontSize: 10 }}>{`${frame.width} × ${frame.height} · ${frame.codec === 'h264' ? 'H.264' : 'JPEG'} · PC ${sourceFps} · Telefon ${fps} FPS · `}{frame.touch ? 'Dokun: tıkla · İki parmak: kaydır' : 'Dokunma için uinput izni ve tek fiziksel monitör gerekiyor.'}</Text>
    </> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{busy ? 'Görüntü hazırlanıyor…' : 'Ne yansıtmak istersin?'}</Text>
      {action('▣ Tüm ekranı yansıt', -1, () => { void start('screen'); }, busy)}
      {action('▤ Aktif uygulamayı yansıt', -2, () => { void start('window'); }, busy)}
    </View>}
  </View>;
  return <View style={{ height: Math.max(100, (size?.height ?? 320) - 22) }}>
    {!fullscreen && content(false)}
    <Modal visible={fullscreen} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setFullscreen(false)}><StatusBar hidden /><InputHost>{content(true)}</InputHost></Modal>
  </View>;
}
function MonitorImage({ frame, surface }: { frame: Frame; surface: string }) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const scale = Math.min(area.width / frame.width, area.height / frame.height);
  return <View style={{ flex: 1, backgroundColor: '#080a10', borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} onLayout={event => setArea(event.nativeEvent.layout)}>
    {area.width > 0 && area.height > 0 && <View nativeID={`cepdesk-monitor:${surface}`} collapsable={false} style={{ width: frame.width * scale, height: frame.height * scale }}><NativeMonitor streamId={frame.stream_id} style={{ width: '100%', height: '100%' }} /></View>}
  </View>;
}
