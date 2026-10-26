import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFavorites, toggleFavorite } from '../src/favorites';
test('favorite application IDs survive reopening and duplicates or malformed data are safe', () => {
  const ids = ['com.system76.CosmicFiles.desktop', 'brave-browser.desktop'];
  assert.deepEqual(parseFavorites(JSON.stringify(ids)), ids);
  assert.deepEqual(parseFavorites(JSON.stringify([ids[0], ids[0], null, 12, '', ids[1]])), ids);
  assert.deepEqual(parseFavorites('{'), []); assert.deepEqual(parseFavorites('{}'), []);
});
test('adding and removing a favorite preserves other favorites and keeps IDs stable', () => {
  const first = toggleFavorite([], 'editor.desktop'); const second = toggleFavorite(first, 'browser.desktop');
  assert.deepEqual(toggleFavorite(second, 'editor.desktop'), ['browser.desktop']);
  assert.deepEqual(first, ['editor.desktop']);
});

test('drag reordering preserves all IDs and ignores vanished targets', async () => {
  const { moveItem, reconcileOrder } = await import('../src/reorder');
  assert.deepEqual(moveItem(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 'a', 'gone'), ['a', 'b']);
  assert.deepEqual(reconcileOrder(['b', 'a', 'closed'], ['a', 'new', 'b']), ['b', 'a', 'new']);
  // Focus changes may change the server order, but never the user's order.
  assert.deepEqual(reconcileOrder(['b', 'a'], ['a', 'b']), ['b', 'a']);
});
