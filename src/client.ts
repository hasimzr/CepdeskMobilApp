import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import type { ConnectionState, Credentials, ProtocolEvent, ServerInfo } from './types';
import { normalizeFingerprint, reconnectDelay, validateAddress } from './validation';

export type MonitorFrame = { stream_id: string; frame_id: number; width: number; height: number; title: string; mode: 'screen' | 'window'; touch: boolean; target_fps: number; source_id: number; capture_fps: number; encode_ms: number; codec?: 'jpeg' | 'h264'; video_id?: number; keyframe?: boolean; error?: string };
type TransportEvent = { session: string; state: string; text?: string; code?: string };
export type Discovery = { state: string; name?: string; host?: string; port?: number; serverId?: string };
interface Native {
  clearMonitorFrame(id: string): Promise<void>;
  addListener(name: 'onMonitorFrame', callback: (value: MonitorFrame) => void): EventSubscription;
  connect(url: string, pin: string, session: string): Promise<void>;
  startAudioPlayback(): Promise<void>; stopAudioPlayback(): Promise<void>;
  pairingNonce(): Promise<string>;
  passwordProof(password: string, hello: string, nonce: string, name: string, session: string): Promise<string>;
  send(text: string): Promise<void>; disconnect(): Promise<void>;
  discover(): Promise<void>; stopDiscovery(): Promise<void>;
  addListener(name: 'onTransport', callback: (value: TransportEvent) => void): EventSubscription;
  addListener(name: 'onDiscovery', callback: (value: Discovery) => void): EventSubscription;
  addListener(name: 'onAudio', callback: (value: { state: string }) => void): EventSubscription;
}
const native = requireOptionalNativeModule<Native>('CepDeskNative');
const KEY = 'cepdesk.connection.v1';
type Listener = () => void;
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
export class Client {
  state: ConnectionState = 'offline';
  phoneAudioActive = false;
  phoneAudioError = '';
  error = ''; info: ServerInfo | null = null; credentials: Credentials | null = null;
  nativeAvailable = !!native;
  private listeners = new Set<Listener>();
  private events = new Set<(event: ProtocolEvent) => void>();
  private pending = new Map<string, Pending>();
  private session = ''; private counter = 0; private attempt = 0; private intentional = false;
  private connecting = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private opening: { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
  constructor() {
    native?.addListener('onAudio', event => { if (event.state === 'error') { this.phoneAudioError = 'Telefon ses çıkışı durdu. Tekrar başlatmayı deneyin.'; this.phoneAudioActive = false; this.notify(); void this.stopPhoneAudio().catch(() => {}); } });
    native?.addListener('onTransport', event => { void this.transport(event); });
    AppState.addEventListener('change', state => {
      if (state === 'background') { this.intentional = true; this.clearTimer(); this.cancelOpen(); void native?.disconnect(); this.failPending(); this.state = 'offline'; this.info = null; this.phoneAudioActive = false; this.notify(); }
      if (state === 'active' && this.credentials && this.state !== 'connected') { this.intentional = false; void this.reconnect(); }
    });
  }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onEvent(listener: (event: ProtocolEvent) => void) { this.events.add(listener); return () => { this.events.delete(listener); }; }
  private notify() { this.listeners.forEach(fn => fn()); }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private cancelOpen() { if (this.opening) { clearTimeout(this.opening.timer); this.opening.reject(new Error('Bağlantı durduruldu.')); this.opening = null; } }
  private failPending() { this.pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error('Bağlantı kesildi. İşler bilgisayarda zaman aşımına kadar devam eder.')); }); this.pending.clear(); }
  async restore() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) { this.credentials = JSON.parse(raw) as Credentials; normalizeFingerprint(this.credentials.fingerprint); validateAddress(this.credentials.host, this.credentials.port); await this.reconnect(); }
    } catch (e) { this.error = e instanceof Error ? e.message : 'Güvenli kayıt okunamadı.'; this.notify(); }
  }
  private async open(host: string, port: number, pin: string) {
    if (!native) throw new Error('Bu özellik Expo development build gerektirir. Expo Go native TLS modülünü içermez.');
    validateAddress(host, port); if (pin) normalizeFingerprint(pin); this.clearTimer(); this.failPending();
    this.session = `${Date.now()}-${++this.counter}`;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.opening = null; reject(new Error('Bağlantı zaman aşımına uğradı. IP, port ve güvenlik duvarını kontrol edin.')); }, 10000);
      this.opening = { resolve, reject, timer };
      native.connect(`wss://${host}:${port}`, pin, this.session).catch(error => { clearTimeout(timer); this.opening = null; reject(error); });
    });
  }
  async pair(host: string, port: number, password: string, name: string) {
    if (!native) throw new Error('Development build gerekli.');
    if ([...password].length < 12 || !name.trim()) throw new Error('Parola en az 12 karakter ve cihaz adı dolu olmalı.');
    this.intentional = true; this.clearTimer(); this.cancelOpen();
    this.error = ''; this.state = 'connecting'; this.notify();
    try {
      await this.open(host, port, ''); this.state = 'pairing'; this.notify();
      const nonce = await native.pairingNonce();
      const hello = await this.request<{ fingerprint: string; server_id: string }>('password.hello', { nonce, name });
      const proof = await native.passwordProof(password, JSON.stringify(hello), nonce, name, this.session);
      password = '';
      const result = await this.request<{ token: string; device: Credentials['device'] }>('password.pair', { proof });
      const info = await this.request<ServerInfo>('auth', { token: result.token });
      if (info.server_id !== hello.server_id) throw new Error('Bilgisayar kimliği değişti.');
      const credentials = { host, port, fingerprint: normalizeFingerprint(hello.fingerprint), token: result.token, server_id: info.server_id, device: result.device };
      await SecureStore.setItemAsync(KEY, JSON.stringify(credentials));
      this.credentials = credentials; this.intentional = false;
      this.info = info; this.state = 'connected'; this.attempt = 0; this.notify();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Bağlantı kurulamadı.';
      this.state = 'error'; this.intentional = true; await native.disconnect(); this.notify(); throw e;
    } finally { password = ''; }
  }
  async reconnect() {
    const credentials = this.credentials; if (!credentials || this.intentional || this.connecting) return;
    this.connecting = true;
    this.clearTimer(); this.state = this.attempt ? 'retrying' : 'connecting'; this.notify();
    try {
      try { await this.open(credentials.host, credentials.port, credentials.fingerprint); }
      catch (e) {
        if (/CERTIFICATE|sertifika/i.test(e instanceof Error ? e.message : '')) throw e;
        const discovered = await this.findComputer(credentials.server_id);
        if (!discovered?.host || !discovered.port || this.intentional) throw e;
        validateAddress(discovered.host, discovered.port);
        await this.open(discovered.host, discovered.port, credentials.fingerprint);
        credentials.host = discovered.host; credentials.port = discovered.port;
        await SecureStore.setItemAsync(KEY, JSON.stringify(credentials));
      }
      const info = await this.request<ServerInfo>('auth', { token: credentials.token });
      if (info.server_id !== credentials.server_id) throw new Error('Bilgisayar kimliği değişti; yeniden eşleştirme gerekli.');
      this.info = info; this.error = ''; this.state = 'connected'; this.attempt = 0; this.notify();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Bağlantı kurulamadı.';
      if (/UNAUTHORIZED|sertifika|CERTIFICATE|kimliği/i.test(message)) { this.error = message; this.intentional = true; this.state = 'error'; this.notify(); }
      else { this.error = message; this.schedule(); }
    } finally { this.connecting = false; }
  }
  private findComputer(serverId: string): Promise<Discovery | null> {
    return new Promise(resolve => {
      let stop: (() => void) | undefined;
      const timer = setTimeout(() => { stop?.(); resolve(null); }, 5000);
      try {
        stop = this.discover(service => {
          if (service.state === 'found' && service.serverId === serverId) {
            clearTimeout(timer); stop?.(); resolve(service);
          }
        });
      } catch { clearTimeout(timer); resolve(null); }
    });
  }
  private schedule() {
    if (this.intentional || !this.credentials || this.timer) return;
    this.state = 'retrying'; this.info = null; this.notify();
    this.timer = setTimeout(() => { this.timer = null; void this.reconnect(); }, reconnectDelay(this.attempt++));
  }
  private async transport(event: TransportEvent) {
    if (event.session !== this.session) return;
    if (event.state === 'open') { if (this.opening) { clearTimeout(this.opening.timer); this.opening.resolve(); this.opening = null; } return; }
    if (event.state === 'message' && event.text) {
      try {
        const message = JSON.parse(event.text);
        if (message.v !== 1) throw new Error('Protokol sürümü uyumsuz.');
        if (typeof message.id === 'string') {
          const pending = this.pending.get(message.id); if (!pending) return;
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.ok) pending.resolve(message.data); else pending.reject(new Error(`${message.error?.code}: ${message.error?.message}`));
        } else if (typeof message.event === 'string') {
          if (message.event === 'system.audio.stopped') { this.phoneAudioError = 'Ses aktarımı durdu. Bilgisayar çıkışını kontrol edip tekrar başlatın.'; this.phoneAudioActive = false; void native?.stopAudioPlayback(); this.notify(); }
          if (message.event === 'capabilities.changed' && this.info) { this.info = { ...this.info, capabilities: message.data }; this.notify(); }
          if (message.event === 'settings.changed' && this.info) { this.info = { ...this.info, settings: message.data }; this.notify(); }
          if (message.event === 'clipboard.notice' && this.info) { this.info = { ...this.info, capabilities: { ...this.info.capabilities, desktop: { ...this.info.capabilities.desktop, clipboard_notice: message.data.message } } }; this.notify(); }
          this.events.forEach(fn => fn(message));
        }
      } catch { this.error = 'Servisten geçersiz bir mesaj alındı.'; this.notify(); }
      return;
    }
    this.failPending(); this.info = null; this.phoneAudioActive = false;
    const error = new Error(event.code === 'CERTIFICATE' ? 'CERTIFICATE: Sertifika parmak izi uyuşmuyor veya sertifika süresi dolmuş. Bilgisayarda kontrol edin.' : 'Bağlantı kesildi.');
    if (this.opening) { clearTimeout(this.opening.timer); this.opening.reject(error); this.opening = null; }
    if (event.code === 'CERTIFICATE') { this.intentional = true; this.error = error.message; this.state = 'error'; this.notify(); return; }
    if (this.state === 'connected') this.schedule();
  }
  async request<T>(method: string, params: unknown = {}): Promise<T> {
    if (!native) throw new Error('Development build gerekli.');
    const id = `${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('İstek zaman aşımına uğradı. Sonucu yeniden sorgulayın.')); }, 10000);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      native.send(JSON.stringify({ v: 1, id, method, params })).catch(error => { clearTimeout(timer); this.pending.delete(id); reject(error); });
    });
  }
  onMonitorFrame(callback: (frame: MonitorFrame) => void) {
    const subscription = native?.addListener('onMonitorFrame', callback);
    return () => subscription?.remove();
  }
  clearMonitorFrame(id: string) { void native?.clearMonitorFrame(id); }
  onPhoneAudioError(callback: () => void) {
    const subscription = native?.addListener('onAudio', event => { if (event.state === 'error') callback(); });
    return () => subscription?.remove();
  }
  async startPhoneAudio() {
    if (!native || this.state !== 'connected') throw new Error('Önce bilgisayara bağlanın.');
    this.phoneAudioError = ''; const requestedSession = this.session;
    try { await native.startAudioPlayback(); await this.request('system.audio.start'); if (this.state !== 'connected' || this.session !== requestedSession) throw new Error('Bağlantı değişti; ses aktarımını tekrar başlatın.'); this.phoneAudioActive = true; this.notify(); } catch (e) { await native.stopAudioPlayback(); throw e; }
  }
  async stopPhoneAudio() {
    this.phoneAudioActive = false; this.notify();
    await native?.stopAudioPlayback();
    if (this.state === 'connected') await this.request('system.audio.stop');
  }
  async forget() {
    this.intentional = true; this.clearTimer(); this.cancelOpen(); await native?.disconnect(); this.failPending();
    await SecureStore.deleteItemAsync(KEY); this.phoneAudioActive = false; this.credentials = null; this.info = null; this.state = 'offline'; this.error = ''; this.notify();
  }
  async changeAddress(host: string, port: number) {
    validateAddress(host, port); if (!this.credentials) return;
    this.credentials = { ...this.credentials, host, port }; await SecureStore.setItemAsync(KEY, JSON.stringify(this.credentials));
    this.intentional = false; this.attempt = 0; await this.reconnect();
  }
  retry() { this.intentional = false; this.attempt = 0; void this.reconnect(); }
  discover(callback: (service: Discovery) => void) {
    if (!native) throw new Error('Yerel keşif development build gerektirir.');
    const subscription = native.addListener('onDiscovery', callback);
    void native.discover().catch(() => callback({ state: 'error' }));
    return () => { subscription.remove(); void native.stopDiscovery(); };
  }
}
export const client = new Client();
