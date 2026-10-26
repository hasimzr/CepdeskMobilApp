export function normalizeFingerprint(value: string): string {
  const pin = value.replace(/[:\s]/g, '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(pin)) throw new Error('Bilgisayardaki SHA-256 parmak izini 64 karakter olarak girin.');
  return pin;
}
export function validateAddress(host: string, port: number): void {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) throw new Error('Geçerli bir IPv4 adresi girin.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port 1–65535 arasında olmalı.');
}
export function reconnectDelay(attempt: number, random = Math.random()): number {
  return Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) + Math.floor(random * 500);
}
export function rerunParams(spec: { saved_id?: string | null; command: string; shell: string; cwd: string; timeout_seconds: number }) {
  return spec.saved_id ? { saved_id: spec.saved_id } : spec;
}
