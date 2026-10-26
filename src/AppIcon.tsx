import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { client } from './client';
const cache = new Map<string, string | null>();
const waiting = new Map<string, { id: string; server: string; resolve: ((uri: string | null) => void)[] }>();
let scheduled = false;
async function flush() {
  const entries = [...waiting.entries()].slice(0, 24);
  entries.forEach(([key]) => waiting.delete(key));
  const server = client.info?.server_id;
  const ids = entries.filter(([, value]) => value.server === server).map(([, value]) => value.id);
  let icons: Record<string, string | null> = {}; let success = false;
  try { if (client.state === 'connected' && ids.length) { icons = (await client.request<{ icons: Record<string, string | null> }>('applications.icons', { ids })).icons; success = true; } } catch { /* leave failed icons retryable */ }
  for (const [key, value] of entries) {
    const uri = value.server === server ? icons[value.id] ?? null : null;
    if (success && value.server === server) { if (cache.size >= 1024) cache.clear(); cache.set(key, uri); }
    value.resolve.forEach(resolve => resolve(uri));
  }
  if (waiting.size) setTimeout(() => { void flush(); }, 120); else scheduled = false;
}
function requestIcon(id: string, server: string): Promise<string | null> {
  const key = `${server}:${id}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  return new Promise(resolve => {
    const pending = waiting.get(key);
    if (pending) pending.resolve.push(resolve); else waiting.set(key, { id, server, resolve: [resolve] });
    if (!scheduled) { scheduled = true; setTimeout(() => { void flush(); }, 30); }
  });
}
export default function AppIcon({ id, name, size = 44, tint = '#E8EEFF', color = '#4E66E9' }: { id: string; name: string; size?: number; tint?: string; color?: string }) {
  const [uri, setUri] = useState<string | null>(null); const server = client.info?.server_id;
  useEffect(() => { let alive = true; setUri(null); if (server) void requestIcon(id, server).then(value => { if (alive) setUri(value); }); return () => { alive = false; }; }, [id, server]);
  return <View style={{ width: size, height: size, borderRadius: size * 0.25, backgroundColor: uri ? '#F3F5FC' : tint, alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 4 }}>
    {uri ? <Image source={{ uri }} resizeMode="contain" onError={() => setUri(null)} style={{ width: size - 8, height: size - 8 }} /> : <Text style={{ color, fontWeight: '800', fontSize: size * 0.42 }}>{name.slice(0, 1).toLocaleUpperCase('tr-TR') || '◇'}</Text>}
  </View>;
}
