import React, { useContext, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, Vibration, View } from 'react-native';
import { PanelSizeContext } from './Dashboard';
import { useWorkspace } from './Workspace';
import { CanvasForeground } from './CanvasActivity';
import { client } from './client';
import { sendInput } from './remote-input';
import { useInputTouch } from './input-touch';
import { emptyMotion, takeMotion } from './motion-buffer';
import { LinuxIcon, MouseIcon } from './InputIcons';
import { k, rows, type Key } from './keyboard-layout';
type Colors = { bg: string; surface: string; text: string; muted: string; accent: string; tint: string; line: string };
function useInput() {
  const workspace = useWorkspace(); const foreground = useContext(CanvasForeground);
  const [error, setError] = useState('');
  const held = useRef(new Set<number>());
  const send = (method: string, params: unknown = {}) => { void sendInput(method, params).catch(e => setError(e instanceof Error ? e.message : 'Giriş gönderilemedi.')); };
  const release = () => { for (const code of held.current) send('input.key', { code, down: false }); held.current.clear(); };
  const key = (code: number, down: boolean) => {
    if (held.current.has(code) === down) return;
    if (down) held.current.add(code); else held.current.delete(code);
    send('input.key', { code, down });
  };
  const active = workspace.model.active;
  const unavailable = client.info?.capabilities.input !== true;
  useEffect(() => {
    if (!foreground) release();
    else if (!unavailable) send('input.start');
    const timer = setInterval(() => { if (foreground && held.current.size) send('input.keepalive'); }, 3000);
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') release(); });
    const unsubscribe = client.subscribe(() => { if (client.state !== 'connected') held.current.clear(); });
    return () => { clearInterval(timer); sub.remove(); unsubscribe(); release(); };
    // Release this panel's keys when its canvas leaves the foreground.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, foreground, unavailable]);
  return { key, send, release, error, unavailable, foreground };
}
function Notice({ error, unavailable, colors: c }: { error: string; unavailable: boolean; colors: Colors }) {
  return (error || unavailable) ? <Text style={{ color: c.muted, fontSize: 11 }}>{error || 'Bilgisayarda giriş desteği kapalı. Güncel servis ve /dev/uinput izni gerekiyor.'}</Text> : null;
}
export function TouchpadPanel({ colors: c }: { colors: Colors }) {
  const input = useInput(); const size = useContext(PanelSizeContext); const workspace = useWorkspace();
  const [buttons, setButtons] = useState(new Set<number>());
  const pending = useRef(emptyMotion()); const busy = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      if (busy.current || client.state !== 'connected') return;
      const movement = takeMotion(pending.current);
      if (!movement) return;
      busy.current = true;
      void sendInput(movement.method, { x: movement.x, y: movement.y }).catch(() => { pending.current = emptyMotion(); }).finally(() => { busy.current = false; });
    }, 33);
    return () => { clearInterval(timer); pending.current = emptyMotion(); };
  }, []);
  useEffect(() => { pending.current = emptyMotion(); }, [workspace.model.active, input.foreground]);
  const surface = useInputTouch(event => {
    if (input.unavailable || !input.foreground) return;
    if (event.action === 'key' && event.code !== undefined) {
      if (event.down) Vibration.vibrate(8);
      if (!event.down) {
        // The last movement must arrive before mouse-up, even between flush ticks.
        const movement = takeMotion(pending.current, true);
        if (movement) input.send(movement.method, { x: movement.x, y: movement.y });
      }
      input.key(event.code, event.down === true);
      setButtons(previous => { const next = new Set(previous); if (event.down) next.add(event.code!); else next.delete(event.code!); return next; });
    } else if (event.action === 'move') { pending.current.x += (event.x ?? 0) * 1.4; pending.current.y += (event.y ?? 0) * 1.4; }
    else if (event.action === 'scroll') { pending.current.sx += (event.x ?? 0) / 24; pending.current.sy += (event.y ?? 0) / 24; }
  });
  useEffect(() => { setButtons(new Set()); }, [workspace.model.active, input.foreground]);
  return <View nativeID={`cepdesk-surface:${surface}`} collapsable={false} style={{ height: Math.max(100, (size?.height ?? 320) - 22), gap: 6 }}>
    <Notice error={input.error} unavailable={input.unavailable} colors={c} />
    <View accessible accessibilityLabel="Touchpad. Bir parmakla hareket, dokunarak sol tık, iki parmakla kaydırma ve sağ tık." style={{ flex: 1, minHeight: 35, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}
      nativeID={`cepdesk-pad:${surface}`} collapsable={false}>
      <Text pointerEvents="none" style={{ color: c.muted, fontSize: 12 }}>Touchpad</Text>
      <Text pointerEvents="none" style={{ color: c.muted, fontSize: 10, marginTop: 5 }}>1 parmak: imleç · 2 parmak: kaydır / sağ tık</Text>
    </View>
    <View style={{ flexDirection: 'row', gap: 6, height: Math.max(28, Math.min(56, (size?.height ?? 320) * .13)) }}>
      {[[272, 'Sol', 'left'], [274, 'Orta', 'middle'], [273, 'Sağ', 'right']].map(([code, label, button]) => <Pressable key={code} disabled={input.unavailable} accessibilityRole="button" accessibilityLabel={`${label} fare tuşu; sürüklemek için basılı tut`} nativeID={`cepdesk-key:${surface}:${code}`} collapsable={false} onPress={() => { Vibration.vibrate(8); input.key(code as number, true); input.key(code as number, false); }} style={{ flex: 1, borderRadius: 9, backgroundColor: buttons.has(code as number) ? c.accent : c.tint, alignItems: 'center', justifyContent: 'center' }}><MouseIcon button={button as 'left' | 'middle' | 'right'} size={Math.max(20, Math.min(32, (size?.height ?? 320) * .075))} color={buttons.has(code as number) ? '#fff' : c.text} highlight={buttons.has(code as number) ? '#fff' : c.accent} /></Pressable>)}
    </View>
  </View>;
}
const navigation: Key[][] = [
  [k(99, 'PrtSc'), k(70, 'ScrLk'), k(119, 'Pause')],
  [k(110, 'Ins'), k(102, 'Home'), k(104, 'PgUp')],
  [k(111, 'Del'), k(107, 'End'), k(109, 'PgDn')],
  [k(113, 'Mute'), k(114, 'Vol−'), k(115, 'Vol+')],
  [k(103, '↑')], [k(105, '←'), k(108, '↓'), k(106, '→')],
];
const compactNavigation: Key[][] = [
  [k(99,'PrtSc'),k(70,'ScrLk'),k(119,'Pause'),k(110,'Ins'),k(111,'Del'),k(102,'Home'),k(107,'End'),k(104,'PgUp'),k(109,'PgDn')],
  [k(113,'Mute'),k(114,'Vol−'),k(115,'Vol+'),k(105,'←'),k(103,'↑'),k(108,'↓'),k(106,'→')],
];
const mainRows: Key[][] = rows.slice(0,6).map((row, index) => index === 0 ? row.slice(0,13) : index === 4 ? [k(42,'Shift',undefined,1.5),k(86,'<','>'),...row.slice(1,-1),k(54,'Shift',undefined,2.5)] : index === 5 ? row.filter(key => key.code !== 127).map(key => key.code === 57 ? { ...key, width: 6 } : key) : row);
const names: Record<number, string> = { 14: 'Backspace', 15: 'Tab', 28: 'Enter', 42: 'Sol Shift', 54: 'Sağ Shift', 58: 'Caps Lock', 29: 'Sol Ctrl', 97: 'Sağ Ctrl', 125: 'Sol Super (Linux)', 126: 'Sağ Super (Linux)', 57: 'Boşluk', 69: 'Num Lock', 96: 'Sayısal Enter', 127: 'Menü' };
const glyphs: Record<number, string> = { 14: '⌫', 15: '⇥', 28: '↵', 42: '⇧', 54: '⇧', 58: '⇪', 57: '⎵', 96: '↵', 127: '☰' };
export function KeyboardPanel({ colors: c }: { colors: Colors }) {
  const input = useInput(); const size = useContext(PanelSizeContext); const workspace = useWorkspace();
  const [pressed, setPressed] = useState(new Set<number>()); const [caps, setCaps] = useState(false); const [num, setNum] = useState(false);
  const [mode, setMode] = useState<'letters' | 'numbers'>('letters');
  const changeMode = (next: 'letters' | 'numbers') => { if (next !== mode) { input.release(); setPressed(new Set()); setMode(next); } };
  const surface = useInputTouch(event => {
    if (input.unavailable || !input.foreground || event.action !== 'key' || event.code === undefined) return;
    const code = event.code;
    if (code < 0) { if (event.down) changeMode(code === -1 ? 'letters' : 'numbers'); return; }
    if (code === 0) { if (event.down) { input.release(); setPressed(new Set()); } return; }
    input.key(code,event.down === true);
    setPressed(previous => { const next = new Set(previous); if (event.down) next.add(code); else next.delete(code); return next; });
    if (event.down && code === 58) setCaps(value => !value);
    if (event.down && code === 69) setNum(value => !value);
  });
  const shift = pressed.has(42) || pressed.has(54);
  const width = size?.width ?? 360; const height = Math.max(100, (size?.height ?? 320) - 22);
  const wide = width >= 520; const unit = (wide ? width * .74 : width) / 15;
  const font = Math.max(9, Math.min(18, unit * .5, height / 20));
  const gap = width >= 480 ? 4 : 2;
  useEffect(() => { setPressed(new Set()); }, [workspace.model.active, input.foreground]);
  const keycap = (key: Key) => {
    const down = pressed.has(key.code); const locked = key.code === 58 && caps || key.code === 69 && num;
    const modifier = [29,97,42,54,56,100,125,126].includes(key.code);
    const superKey = key.code === 125 || key.code === 126;
    return <View key={key.code} accessible accessibilityRole="button" accessibilityLabel={names[key.code] ?? key.label} accessibilityState={{ disabled: input.unavailable, selected: down || locked }}
      nativeID={`cepdesk-key:${surface}:${key.code}`} collapsable={false}
      onAccessibilityTap={() => { if (!input.unavailable) { input.key(key.code,true); input.key(key.code,false); if (key.code === 58) setCaps(value => !value); if (key.code === 69) setNum(value => !value); } }}
      style={{ flex: key.width ?? 1, borderWidth: 1, borderBottomWidth: down ? 1 : 3, borderColor: down ? c.accent : c.line, borderRadius: Math.min(7, unit / 5), backgroundColor: down ? c.accent : modifier ? c.bg : c.tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {locked && <View pointerEvents="none" style={{ position: 'absolute', top: 3, left: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: down ? '#fff' : c.accent }} />}
      {superKey ? <LinuxIcon size={Math.max(14, Math.min(26, font * 1.65))} /> : <>
        {key.shifted && height >= 260 && unit >= 22 && <Text pointerEvents="none" style={{ position: 'absolute', top: 2, right: 4, color: down ? '#fff' : c.muted, fontSize: Math.max(7, font * .6) }}>{key.shifted}</Text>}
        <Text pointerEvents="none" adjustsFontSizeToFit numberOfLines={1} minimumFontScale={.6} style={{ color: down ? '#fff' : c.text, fontSize: key.label.length > 3 && !glyphs[key.code] ? font * .8 : font, fontWeight: key.label.length === 1 ? '600' : '500', paddingHorizontal: 2 }}>{glyphs[key.code] ?? (shift && key.shifted ? key.shifted : key.label)}</Text>
      </>}
    </View>;
  };
  const row = (keys: Key[], index: number, weight = 1, functionRow = false) => <View key={index} style={{ flex: weight, flexDirection: 'row', gap }}>
    {keys.map((key, position) => <React.Fragment key={key.code}>{functionRow && [1,5,9].includes(position) && <View style={{ width: gap }} />}{keycap(key)}</React.Fragment>)}
  </View>;
  const nav = () => <View style={{ flex: 1, gap }}>{navigation.map((keys,index) => index === 4 ? <View key={index} style={{ flex: 1, flexDirection: 'row', gap }}><View style={{ flex: 1 }} />{keycap(keys[0]!)}<View style={{ flex: 1 }} /></View> : row(keys,index,index === 0 ? .72 : 1))}</View>;
  const numpad = () => <View style={{ flex: 1, gap }}>
    {row([k(69,'Num'),k(98,'÷'),k(55,'×'),k(74,'−')],0)}
    <View style={{ flex: 4, flexDirection: 'row', gap }}>
      <View style={{ flex: 3, gap }}>{[[k(71,'7'),k(72,'8'),k(73,'9')],[k(75,'4'),k(76,'5'),k(77,'6')],[k(79,'1'),k(80,'2'),k(81,'3')],[k(82,'0',undefined,2),k(83,'.')]].map((keys,index) => row(keys,index))}</View>
      <View style={{ flex: 1, gap }}>{keycap(k(78,'+'))}{keycap(k(96,'Enter'))}</View>
    </View>
  </View>;
  const heldNames = [pressed.has(29) || pressed.has(97) ? 'Ctrl' : '', shift ? 'Shift' : '', pressed.has(56) ? 'Alt' : '', pressed.has(100) ? 'AltGr' : '', pressed.has(125) || pressed.has(126) ? 'Super' : ''].filter(Boolean).join(' + ');
  return <View nativeID={`cepdesk-surface:${surface}`} collapsable={false} style={{ height, gap }}>
    <Notice error={input.error} unavailable={input.unavailable} colors={c} />
    <View style={{ height: height < 200 ? 22 : 28, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: heldNames ? c.accent : c.muted, fontSize: 10 }}>{heldNames || 'Klavye'}</Text>
      {(['letters','numbers'] as const).map((value,index) => <Pressable key={value} nativeID={`cepdesk-key:${surface}:${-index-1}`} collapsable={false} accessibilityRole="button" accessibilityLabel={value === 'letters' ? 'Harfler ve gezinme tuşları' : 'Sayısal klavye'} accessibilityState={{ selected: mode === value }} onPress={() => changeMode(value)} style={{ paddingHorizontal: 10, height: '100%', justifyContent: 'center', borderRadius: 7, backgroundColor: mode === value ? c.tint : c.bg }}><Text style={{ color: mode === value ? c.accent : c.muted, fontSize: 11, fontWeight: '600' }}>{value === 'letters' ? 'ABC' : '123'}</Text></Pressable>)}
      <View style={{ width: 28, height: '100%' }}>{keycap(k(127,'Menu'))}</View>
      <Pressable nativeID={`cepdesk-key:${surface}:0`} collapsable={false} accessibilityRole="button" accessibilityLabel="Basılı tuşları bırak" onPress={() => { input.release(); setPressed(new Set()); }} style={{ paddingHorizontal: 8, justifyContent: 'center', height: '100%' }}><Text style={{ color: c.accent, fontSize: 18 }}>↺</Text></Pressable>
    </View>
    {wide ? <View style={{ flex: 1, flexDirection: 'row', gap: gap * 2 }}>
      <View style={{ flex: 15, gap }}>{mainRows.map((keys,index) => row(keys,index,index === 0 ? .72 : 1,index === 0))}</View>
      <View style={{ flex: 4.5, gap, borderLeftWidth: 1, borderColor: c.line, paddingLeft: gap * 2 }}>{mode === 'numbers' ? numpad() : nav()}</View>
    </View> : mode === 'numbers' ? <View style={{ flex: 1, gap }}>
      <View style={{ flex: 5, flexDirection: 'row', gap: gap * 2 }}><View style={{ flex: 4 }}>{numpad()}</View><View style={{ flex: 3 }}>{nav()}</View></View>
      {row(mainRows[5]!,6)}
    </View> : <View style={{ flex: 1, gap }}>
      <View style={{ flex: 6, gap }}>{mainRows.map((keys,index) => row(keys,index,index === 0 ? .72 : 1,index === 0))}</View>
      <View style={{ flex: 1.65, gap, borderTopWidth: 1, borderColor: c.line, paddingTop: gap }}>{compactNavigation.map((keys,index) => row(keys,index))}</View>
    </View>}
  </View>;
}
