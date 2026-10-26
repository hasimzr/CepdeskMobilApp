import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCanvas, changeCanvas, firstWorkspace, parseWorkspace, removeCanvas, switchCanvas, togglePanel, panelHeight } from '../src/canvas-model';
import { gridRects } from '../src/dashboard-layout';
import { twoFingerDirection, type Touch } from '../src/canvas-gesture';

test('existing layout migrates into the first canvas without losing panel order or widths', () => {
  const legacy = { version: 3, order: ['system','media','windows','commands','clipboard','applications'], spans: { applications: 4,clipboard: 2,windows: 1,media: 3,commands: 2,system: 4 } };
  const model = firstWorkspace(JSON.stringify(legacy));
  assert.deepEqual(model.canvases[0]!.layout.order, legacy.order);
  assert.deepEqual(model.canvases[0]!.layout.spans, { ...legacy.spans, touchpad: 4, keyboard: 4, monitor: 4 });
  assert.deepEqual(parseWorkspace(JSON.stringify(model)), model);
});
test('multiple canvases keep separate sections and dimensions after reopening', () => {
  let model = addCanvas(firstWorkspace(), 'second');
  model = changeCanvas(model,'second',canvas => ({ ...canvas,name:'Medya masası',layout:{ ...togglePanel(canvas.layout,'media'),heights:{ ...canvas.layout.heights,media:620 },spans:{ ...canvas.layout.spans,media:4 } } }));
  const restored = parseWorkspace(JSON.stringify(model))!;
  assert.deepEqual(restored,model);
  assert.deepEqual(restored.canvases[1]!.layout.order,['media']);
  assert.equal(restored.canvases[1]!.layout.heights?.media,620);
  assert.equal(restored.canvases[0]!.layout.heights?.media,320);
  assert.equal(gridRects(restored.canvases[1]!.layout,360)[0]!.height,620);
});
test('empty canvases are valid and the canvas count has no fixed application limit', () => {
  let model = firstWorkspace();
  for (let index=0;index<120;index++) model=addCanvas(model,`canvas-${index}`);
  assert.equal(model.canvases.length,121);
  assert.equal(model.canvases.at(-1)!.layout.order.length,0);
  assert.deepEqual(parseWorkspace(JSON.stringify(model)),model);
});
test('deletion picks a valid neighboring canvas and never removes the final canvas', () => {
  const first = firstWorkspace(); assert.equal(removeCanvas(first,first.active),first);
  let model = addCanvas(addCanvas(first,'second'),'third');
  model = removeCanvas(model,'third'); assert.equal(model.active,'second');
  model = removeCanvas(model,'second'); assert.equal(model.active,first.active);
});
test('canvas navigation stops at the edges rather than selecting an invalid page', () => {
  let model = addCanvas(firstWorkspace(),'second');
  assert.equal(switchCanvas(model,1),model);
  model = switchCanvas(model,-1); assert.equal(model.active,'first-canvas');
  assert.equal(switchCanvas(model,-1),model);
});
test('malformed workspace records are rejected instead of silently replacing saved designs', () => {
  const model = firstWorkspace();
  assert.equal(parseWorkspace('{'),null);
  assert.equal(parseWorkspace(JSON.stringify({ ...model,canvases:[] })),null);
  assert.equal(parseWorkspace(JSON.stringify({ ...model,canvases:[model.canvases[0],model.canvases[0]] })),null);
  const broken = changeCanvas(model,model.active,canvas=>({ ...canvas,layout:{ ...canvas.layout,heights:{ media:NaN } } }));
  assert.equal(parseWorkspace(JSON.stringify(broken)),null);
  assert.equal(panelHeight(43),160); assert.equal(panelHeight(3000),1600);
});
test('customized panel heights remain non-overlapping across screen widths', () => {
  const model = firstWorkspace(); const layout = model.canvases[0]!.layout;
  layout.heights={ applications:180,clipboard:640,windows:200,media:280,commands:520,system:400 };
  for (const width of [300,600,1000,1400]) {
    const rects=gridRects(layout,width);
    for (const rect of rects) assert.equal(rect.height,layout.heights[rect.id]);
    for (let a=0;a<rects.length;a++) for(let b=a+1;b<rects.length;b++) { const one=rects[a]!;const two=rects[b]!;assert.ok(one.x+one.width<=two.x||two.x+two.width<=one.x||one.y+one.height<=two.y||two.y+two.height<=one.y); }
  }
});
const start: Touch[]=[{id:'one',x:100,y:120},{id:'two',x:200,y:120}];
const move=(dx:number,dy=0):Touch[]=>start.map(t=>({ ...t,x:t.x+dx,y:t.y+dy }));
test('two fingers translating together switch in the expected direction', () => {
  assert.equal(twoFingerDirection(start,move(-100)),1);
  assert.equal(twoFingerDirection(start,move(100)),-1);
});
test('one finger, three fingers, pinch, vertical moves and small motions do not switch canvases', () => {
  assert.equal(twoFingerDirection(start.slice(0,1),move(100).slice(0,1)),null);
  assert.equal(twoFingerDirection([...start,{id:'third',x:300,y:120}],move(100)),null);
  assert.equal(twoFingerDirection(start,[{id:'one',x:0,y:120},{id:'two',x:300,y:120}]),null);
  assert.equal(twoFingerDirection(start,move(100,200)),null);
  assert.equal(twoFingerDirection(start,move(20)),null);
  assert.equal(twoFingerDirection(start,[{id:'other',x:300,y:120},{id:'two',x:300,y:120}]),null);
});

test('rapid canvas edits coalesce into the last durable snapshot without an unbounded write queue', async () => {
  const { layoutWriter } = await import('../src/layout-storage');
  let release: (()=>void) | undefined; let calls=0; let stored='';
  const write=layoutWriter<ReturnType<typeof firstWorkspace>>(async raw=>{ calls++; if(calls===1) await new Promise<void>(resolve=>{ release=resolve; }); stored=raw; });
  const initial=firstWorkspace(); const writes=[write(initial)]; let latest=initial;
  for(let index=0;index<40;index++) { latest=changeCanvas(latest,latest.active,canvas=>({ ...canvas,name:`Tuval ${index}` })); writes.push(write(latest)); }
  assert.equal(calls,1); release!(); await Promise.all(writes);
  assert.equal(calls,2); assert.deepEqual(parseWorkspace(stored),latest);
});

test('free panel widths preserve exact drag sizes rather than snapping to 25 percent steps',async()=>{
  const {freeWidth}=await import('../src/dashboard-layout');
  const model=firstWorkspace();const layout=model.canvases[0]!.layout;
  layout.widths={windows:freeWidth(213,600),media:freeWidth(177,600)};
  const rects=gridRects(layout,600);
  assert.ok(Math.abs(rects.find(rect=>rect.id==='windows')!.width-213)<0.001);
  assert.ok(Math.abs(rects.find(rect=>rect.id==='media')!.width-177)<0.001);
  assert.deepEqual(parseWorkspace(JSON.stringify(model)),model);
});
test('legacy canvas workspace migrates without losing its selected page or dimensions',()=>{
  const model=firstWorkspace();const old={...model,version:1};
  const restored=parseWorkspace(JSON.stringify(old))!;
  assert.equal(restored.version,2);assert.equal(restored.active,model.active);
  assert.deepEqual(restored.canvases,model.canvases);
});

test('input panels preserve old workspaces and save their own dimensions', () => {
  const model = firstWorkspace();
  const old = JSON.parse(JSON.stringify(model));
  delete old.canvases[0].layout.spans.touchpad; delete old.canvases[0].layout.spans.keyboard; delete old.canvases[0].layout.spans.monitor;
  assert.ok(parseWorkspace(JSON.stringify(old)));
  const changed = changeCanvas(model, model.active, canvas => ({ ...canvas, layout: { ...togglePanel(togglePanel(canvas.layout, 'touchpad'), 'keyboard'), heights: { touchpad: 480, keyboard: 360 } } }));
  const restored = parseWorkspace(JSON.stringify(changed))!;
  assert.ok(restored.canvases[0]!.layout.order.includes('keyboard'));
  assert.equal(gridRects(restored.canvases[0]!.layout, 600).find(rect => rect.id === 'touchpad')!.height, 480);
});
