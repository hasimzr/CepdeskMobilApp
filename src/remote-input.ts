import { client } from './client';
// Serialize key transitions so Shift/Ctrl always reaches the PC before the next key.
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
let wasConnected = false;
client.subscribe(() => {
  const connected = client.state === 'connected';
  if (connected !== wasConnected) { generation++; queue = Promise.resolve(); wasConnected = connected; }
});
export function sendInput(method: string, params: unknown = {}): Promise<unknown> {
  if (client.state !== 'connected') return Promise.reject(new Error('Önce bilgisayara bağlanın.'));
  const session = generation;
  const next = queue.catch(() => {}).then(() => {
    if (session !== generation || client.state !== 'connected') throw new Error('Bağlantı değişti.');
    return client.request(method, params);
  });
  queue = next;
  return next;
}
