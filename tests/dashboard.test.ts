import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultLayout, dropTarget, gridRects, minimumSpan, movePanel, PANEL_IDS, parseLayout, resizedSpan, type PanelSpan } from '../src/dashboard-layout';
import { layoutWriter } from '../src/layout-storage';

test('restoring a saved layout keeps all six panels and their widths; invalid records recover safely', () => {
  const changed = movePanel(defaultLayout(), 'commands', 'clipboard'); changed.spans.media = 3;
  assert.deepEqual(parseLayout(JSON.stringify(changed)), changed);
  for (const raw of [null, '{', 'null', '[]', JSON.stringify({ ...changed, version: 99 }), JSON.stringify({ ...changed, order: ['clipboard', 'clipboard', 'media', 'commands'] }), JSON.stringify({ ...changed, spans: { ...changed.spans, media: 0 } }), JSON.stringify({ ...changed, spans: { ...changed.spans, media: '3' } })]) assert.deepEqual(parseLayout(raw), defaultLayout());
});
test('grid stays within the viewport without overlapping for every width combination and rotation', () => {
  for (const width of [280, 360, 720, 959, 960, 1200]) {
    for (let encoded = 0; encoded < 4096; encoded++) {
      const layout = defaultLayout();
      PANEL_IDS.forEach((id, index) => { layout.spans[id] = (1 + (encoded >> (index * 2) & 3)) as PanelSpan; });
      const rects = gridRects(layout, width, 260);
      for (const rect of rects) {
        assert.ok(rect.x >= 0 && rect.width > 0 && rect.x + rect.width <= width + 0.001);
        assert.equal(rect.height, rect.id === 'applications' ? 156 : 260); assert.ok(rect.span >= minimumSpan(width));
      }
      for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
        const one = rects[a]!; const two = rects[b]!;
        assert.ok(one.x + one.width <= two.x || two.x + two.width <= one.x || one.y + one.height <= two.y || two.y + two.height <= one.y);
      }
      assert.deepEqual(parseLayout(JSON.stringify(layout)), layout); // responsive clamps must not overwrite the saved width
    }
  }
});
test('dragging to another panel changes order without losing any section or its width', () => {
  const layout = defaultLayout(); layout.spans.media = 3;
  for (const from of layout.order) for (const to of layout.order) {
    const moved = movePanel(layout, from, to);
    assert.deepEqual([...moved.order].sort(), [...layout.order].sort());
    assert.deepEqual(moved.spans, layout.spans);
    if (from !== to) assert.equal(moved.order.indexOf(from), layout.order.indexOf(to));
  }
  const rects = gridRects(defaultLayout(), 360, 260);
  const first = rects.find(rect => rect.id === 'clipboard')!; const last = rects.find(rect => rect.id === 'commands')!;
  assert.equal(dropTarget(rects, first.id, last.x + last.width / 2 - first.x - first.width / 2, last.y + last.height / 2 - first.y - first.height / 2), 'commands');
  assert.equal(dropTarget(rects, first.id, 0, 0), null);
  assert.equal(dropTarget(rects, first.id, 9999, -9999), null);
});
test('resize snaps to grid and respects phone and tablet limits', () => {
  assert.equal(resizedSpan(gridRects(defaultLayout(), 360).find(rect => rect.id === 'clipboard')!.width, 0, 360), 2);
  assert.equal(resizedSpan(174, -500, 360), 2);
  assert.equal(resizedSpan(174, 500, 360), 4);
  assert.equal(resizedSpan(400, -500, 1200), 1);
  assert.equal(resizedSpan(gridRects(defaultLayout(), 360).find(rect => rect.id === 'clipboard')!.width, 92, 360), 3);
});
test('queued storage writes preserve the last edit even if the first write is delayed', async () => {
  let release: (() => void) | undefined; let stored = ''; let calls = 0;
  const enqueue = layoutWriter(async raw => { calls++; if (calls === 1) await new Promise<void>(resolve => { release = resolve; }); stored = raw; });
  const first = enqueue(defaultLayout()); const last = movePanel(defaultLayout(), 'commands', 'clipboard'); last.spans.clipboard = 4;
  const second = enqueue(last);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1); release!();
  await Promise.all([first, second]); assert.deepEqual(parseLayout(stored), last);
});
test('a failed save can be retried and does not prevent later edits from being stored', async () => {
  let fail = true; let stored = '';
  const enqueue = layoutWriter(async raw => { if (fail) { fail = false; throw new Error('storage unavailable'); } stored = raw; });
  await assert.rejects(enqueue(defaultLayout()));
  const updated = movePanel(defaultLayout(), 'media', 'clipboard');
  await enqueue(updated); assert.deepEqual(parseLayout(stored), updated);
});

test('old four-panel layouts gain the launcher without losing customized order or widths', () => {
  const saved = { version: 1, order: ['commands', 'clipboard', 'media', 'windows'], spans: { commands: 4, clipboard: 2, media: 3, windows: 1 } };
  const migrated = parseLayout(JSON.stringify(saved));
  assert.deepEqual(migrated.order, ['applications', ...saved.order, 'system']);
  assert.equal(migrated.spans.commands, 4); assert.equal(migrated.spans.media, 3); assert.equal(migrated.spans.applications, 4);
  assert.deepEqual(parseLayout(JSON.stringify(migrated)), migrated);
});

test('v2 layouts preserve favorites-area order and dimensions when the system section is added', () => {
  const saved = { version: 2, order: ['media','applications','commands','windows','clipboard'], spans: { applications: 3,media: 4,commands: 2,windows: 2,clipboard: 2 } };
  const migrated = parseLayout(JSON.stringify(saved));
  assert.deepEqual(migrated.order, [...saved.order, 'system']);
  assert.equal(migrated.spans.applications, 3); assert.equal(migrated.spans.media, 4);
});
