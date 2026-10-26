import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeMotion } from '../src/motion-buffer';
test('fractional two-finger scroll never stalls later pointer motion or drag release', () => {
  const buffer = { x: 0, y: 0, sx: .25, sy: 1.75 };
  assert.deepEqual(takeMotion(buffer), { method: 'input.scroll', x: 0, y: 1 });
  assert.equal(takeMotion(buffer), null);
  buffer.x = 16.5; buffer.y = -8;
  assert.deepEqual(takeMotion(buffer), { method: 'input.move', x: 16, y: -8 });
  buffer.x += 4; buffer.sy += 2;
  assert.deepEqual(takeMotion(buffer, true), { method: 'input.move', x: 4, y: 0 });
  assert.deepEqual(takeMotion(buffer), { method: 'input.scroll', x: 0, y: 2 });
});
