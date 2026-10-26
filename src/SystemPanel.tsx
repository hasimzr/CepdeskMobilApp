import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { client } from './client';
import ControlSlider from './ControlSlider';
import { useRemote } from './useRemote';
type Colors = { bg: string; surface: string; text: string; muted: string; tint: string; accent: string; line: string; danger: string };
type AudioDevice = { id: string; name: string; volume: number; muted: boolean };
type Network = { ssid: string; bssid: string; signal: number; security: string; active: boolean };
type Controls = {
  audio: { available: boolean; reason?: string; sinks?: AudioDevice[]; sources?: AudioDevice[]; sink?: string; source?: string };
  wifi: { enabled?: boolean; reason?: string; networks?: Network[]; profiles?: { id: string; name: string }[] };
  power: { poweroff: boolean; reboot: boolean; suspend: boolean }; phone_audio: boolean;
};
export default function SystemPanel({ colors: c }: { colors: Colors }) {
  const remote = useRemote<Controls>('system.controls', {}, [], 5000); const info = remote.data; const refresh = remote.refresh; const [error, setError] = useState(client.phoneAudioError); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<'sinks' | 'sources' | 'wifi' | null>(null); const [network, setNetwork] = useState<Network | null>(null); const [password, setPassword] = useState('');
  const [phoneAudio, setPhoneAudio] = useState(client.phoneAudioActive); const activeAudio = useRef(client.phoneAudioActive); const insets = useSafeAreaInsets();
  useEffect(() => {
    const connection = client.subscribe(() => { activeAudio.current = client.phoneAudioActive; setPhoneAudio(client.phoneAudioActive); if (client.phoneAudioError) setError(client.phoneAudioError); });
    const events = client.onEvent(event => { if (event.event === 'system.audio.stopped') { activeAudio.current = false; setPhoneAudio(false); setError('Ses aktarımı durdu. Bilgisayarın ses çıkışını kontrol edip yeniden başlatın.'); } });
    const playbackError = client.onPhoneAudioError(() => { activeAudio.current = false; setPhoneAudio(false); setError('Telefon ses çıkışı durdu. Tekrar başlatmayı deneyin.'); });
    return () => { events(); playbackError(); connection(); };
    // This panel is mounted for the current authenticated connection.
  }, []);
  const run = async (method: string, params: object, update = true) => {
    if (busy) return; setBusy(true); setError('');
    try { await client.request(method, params); if (update) await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.'); }
    finally { setBusy(false); }
  };
  const control = (action: string, params: object) => { void run('system.control', { action, ...params }); };
  const selectDevice = async (action: 'sink' | 'source', id: string) => {
    setSheet(null);
    await run('system.control', { action, id });
    if (action === 'sink' && activeAudio.current) { try { await client.stopPhoneAudio(); await client.startPhoneAudio(); } catch (e) { activeAudio.current = false; setPhoneAudio(false); setError(e instanceof Error ? e.message : 'Ses aktarımı yeniden başlatılamadı.'); } }
  };
  const audio = async (enabled: boolean) => {
    if (busy) return; setBusy(true); setError('');
    try { if (enabled) await client.startPhoneAudio(); else await client.stopPhoneAudio(); activeAudio.current = enabled; setPhoneAudio(enabled); }
    catch (e) { setError(e instanceof Error ? e.message : 'Telefon sesi başlatılamadı.'); }
    finally { setBusy(false); }
  };
  const changeNetwork = (params: object) => Alert.alert('Wi-Fi değiştirilsin mi?', 'Bilgisayarın ağı değişince bağlantı kesilebilir. Telefonu da aynı ağa bağlayıp tekrar bağlanın.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Bağlan', onPress: () => { setSheet(null); setNetwork(null); setPassword(''); setNotice('Wi-Fi bağlantısı değiştiriliyor. Bağlantı kesilirse aynı ağdan yeniden bağlanın.'); void run('system.wifi.connect', params, false); } }]);
  const power = (action: 'poweroff' | 'reboot' | 'suspend') => {
    const name = { poweroff: 'Bilgisayarı kapat', reboot: 'Yeniden başlat', suspend: 'Uykuya al' }[action];
    Alert.alert(`${name}?`, 'Açık işleriniz etkilenebilir; bilgisayarla bağlantı kesilecek.', [{ text: 'Vazgeç', style: 'cancel' }, { text: name, style: 'destructive', onPress: () => { void run('system.power', { action, confirmed: true }, false); } }]);
  };
  const sink = info?.audio.sinks?.find(d => d.id === info.audio.sink); const source = info?.audio.sources?.find(d => d.id === info.audio.source);
  const actionButton = (label: string, press: () => void, disabled = busy, danger = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={press} style={[s.button, { backgroundColor: c.tint, opacity: disabled ? 0.35 : 1 }]}><Text style={{ color: danger ? c.danger : c.accent, fontSize: 12, fontWeight: '600' }}>{label}</Text></Pressable>;
  return <>
    {!info && <ActivityIndicator color={c.accent} />}
    {!!(error || remote.error) && <Text style={{ color: c.danger, fontSize: 12 }}>{error || remote.error}</Text>}{!!notice && <Text style={{ color: c.muted, fontSize: 12 }}>{notice}</Text>}
    {info?.audio.available ? <>
      <View style={s.row}><Text style={{ color: c.muted, fontSize: 12, flex: 1 }}>Hoparlör · {Math.round((sink?.volume ?? 0) * 100)}%</Text>{actionButton(sink?.muted ? '🔇' : '🔊', () => control('mute', { muted: !sink?.muted }))}</View>
      <ControlSlider value={sink?.volume ?? 0} onCommit={volume => control('volume', { volume })} disabled={busy || !sink} label="Bilgisayar hoparlör sesi" color={c.accent} track={c.line} />
      {actionButton(sink?.name ?? 'Ses çıkışı seç', () => setSheet('sinks'))}
      <View style={s.row}><Text style={{ color: c.muted, fontSize: 12, flex: 1 }}>Mikrofon · {Math.round((source?.volume ?? 0) * 100)}%</Text>{actionButton(source?.muted ? '🎙 Kapalı' : '🎙 Açık', () => control('mic_mute', { muted: !source?.muted }), busy || !source)}</View>
      <ControlSlider value={source?.volume ?? 0} onCommit={volume => control('mic_volume', { volume })} disabled={busy || !source} label="Bilgisayar mikrofon seviyesi" color={c.accent} track={c.line} />
      {actionButton(source?.name ?? 'Mikrofon seç', () => setSheet('sources'), busy || !info.audio.sources?.length)}
      <View style={s.row}><Text style={{ color: c.text, fontSize: 12, flex: 1 }}>Telefonu hoparlör olarak kullan</Text><Switch accessibilityLabel="Bilgisayar sesini telefonda dinle" value={phoneAudio} disabled={busy || !info.phone_audio} onValueChange={enabled => { void audio(enabled); }} /></View>
      {phoneAudio && <Text style={{ color: c.muted, fontSize: 11 }}>Canlı ses yerel ağdan aktarılıyor. Uygulama arka plana geçince durur.</Text>}
    </> : info && <Text style={{ color: c.muted, fontSize: 12 }}>{info.audio.reason}</Text>}
    <View style={s.row}>{actionButton('⌁ Wi-Fi ağları', () => { setNetwork(null); setSheet('wifi'); }, busy || !info?.wifi.networks)}{info?.wifi.enabled !== undefined && actionButton(info.wifi.enabled ? 'Wi-Fi kapat' : 'Wi-Fi aç', () => Alert.alert('Wi-Fi durumu değiştirilsin mi?', 'Wi-Fi kapatılırsa bağlantınız kesilebilir.', [{ text: 'Vazgeç' }, { text: 'Değiştir', onPress: () => control('wifi_radio', { enabled: !info.wifi.enabled }) }]))}</View>
    {!!info?.wifi.reason && <Text style={{ color: c.muted, fontSize: 12 }}>{info.wifi.reason}</Text>}
    <View style={s.row}>{actionButton('☾ Uyku', () => power('suspend'), busy || !info?.power.suspend)}{actionButton('↻ Yeniden başlat', () => power('reboot'), busy || !info?.power.reboot)}{actionButton('⏻ Kapat', () => power('poweroff'), busy || !info?.power.poweroff, true)}</View>
    {actionButton('↻ Yenile', () => { void refresh(); })}
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
      <View style={s.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Cihaz seçimini kapat" style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} /><View style={[s.sheet, { backgroundColor: c.surface, paddingBottom: Math.max(16, insets.bottom) }]}>
        <View style={s.row}><Text style={{ color: c.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{sheet === 'wifi' ? 'Wi-Fi ağları' : sheet === 'sources' ? 'Mikrofonlar' : 'Ses çıkışları'}</Text>{actionButton('×', () => setSheet(null), false)}</View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingTop: 12 }}>
          {sheet === 'wifi' ? <>
            {info?.wifi.profiles?.map(profile => <React.Fragment key={profile.id}>{actionButton(`✓ ${profile.name}`, () => changeNetwork({ profile: profile.id }))}</React.Fragment>)}
            {info?.wifi.networks?.map(wifi => <React.Fragment key={wifi.bssid}>{actionButton(`${wifi.active ? '● ' : ''}${wifi.ssid} · ${wifi.signal}% · ${wifi.security || 'Açık'}`, () => { setNetwork(wifi); setPassword(''); }, busy || /802\.1X|EAP/.test(wifi.security))}</React.Fragment>)}
            {network && <View style={{ gap: 8, paddingVertical: 8 }}><Text style={{ color: c.text }}>{network.ssid}</Text>{!!network.security && network.security !== '--' && <TextInput accessibilityLabel="Wi-Fi parolası" secureTextEntry value={password} onChangeText={setPassword} placeholder="Wi-Fi parolası" placeholderTextColor={c.muted} autoCapitalize="none" style={[s.input, { color: c.text, borderColor: c.line }]} />}{actionButton('Bu ağa bağlan', () => changeNetwork({ ssid: network.ssid, password, security: network.security }), busy || (!!network.security && network.security !== '--' && password.length < 8))}</View>}
            <Text style={{ color: c.muted, fontSize: 12 }}>Kayıtlı ağlar üsttedir. Yeni bağlantı için açık veya WPA/WPA2/WPA3 kişisel ağ seçin. Kurumsal ağları bilgisayarda kaydettikten sonra seçebilirsiniz.</Text>
          </> : (sheet === 'sources' ? info?.audio.sources : info?.audio.sinks)?.map(device => <React.Fragment key={device.id}>{actionButton(`${device.id === (sheet === 'sources' ? info?.audio.source : info?.audio.sink) ? '✓ ' : ''}${device.name}`, () => { void selectDevice(sheet === 'sources' ? 'source' : 'sink', device.id); })}</React.Fragment>)}
        </ScrollView>
      </View></View>
    </Modal>
  </>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, button: { minHeight: 38, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, justifyContent: 'center', maxWidth: '100%' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 }, overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(8,10,22,0.64)' }, sheet: { maxHeight: '82%', width: '100%', maxWidth: 900, padding: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
});
