import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFingerprint, reconnectDelay, rerunParams, validateAddress } from '../src/validation';

test('fingerprint must come from the desktop and contain a full SHA-256 digest', () => {
  assert.equal(normalizeFingerprint('AA:'.repeat(31) + 'AA'), 'aa'.repeat(32));
  assert.throws(() => normalizeFingerprint('trust-all'));
  assert.throws(() => normalizeFingerprint('a'.repeat(63)));
});
test('manual LAN address validation prevents malformed URL injection', () => {
  validateAddress('192.168.1.10', 43821);
  for (const host of ['256.1.1.1', '192.168.1.1/path', 'example.org', 'user@127.0.0.1']) assert.throws(() => validateAddress(host, 43821));
  assert.throws(() => validateAddress('127.0.0.1', 0));
});
test('reconnection uses bounded exponential delay and jitter', () => {
  assert.equal(reconnectDelay(0, 0), 1000);
  assert.equal(reconnectDelay(1, 0), 2000);
  assert.equal(reconnectDelay(99, 0), 30000);
  assert.ok(reconnectDelay(99, 0.99) < 30500);
});
test('saved-command rerun uses the current desktop definition and permission checks', () => {
  const spec = { saved_id: 'saved-id', command: 'old', shell: '/bin/bash', cwd: '/tmp', timeout_seconds: 5 };
  assert.deepEqual(rerunParams(spec), { saved_id: 'saved-id' });
  assert.deepEqual(rerunParams({ ...spec, saved_id: null }), { ...spec, saved_id: null });
});
