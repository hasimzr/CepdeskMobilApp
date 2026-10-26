import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteEntry } from '../src/remote-cache';
test('many mounted canvases share a single request and receive the same prepared data', async()=>{
  let calls=0; let complete:((value:unknown)=>void)|undefined;
  const entry=new RemoteEntry(()=>{calls++;return new Promise(resolve=>{complete=resolve;});});
  const waits=Array.from({length:100},()=>entry.refresh());assert.equal(calls,1);
  const data={items:[{id:'one',preview:'ready'}]};complete!(data);await Promise.all(waits);
  assert.equal(entry.snapshot.data,data);assert.equal(entry.snapshot.loading,false);
});
test('refreshing keeps prepared canvas data visible and cannot restore data from an old connection',async()=>{
  let resolve:((value:unknown)=>void)|undefined;
  const entry=new RemoteEntry(()=>new Promise(done=>{resolve=done;}));
  const first=entry.refresh();resolve!({windows:[1]});await first;
  const refresh=entry.refresh();assert.deepEqual(entry.snapshot.data,{windows:[1]});
  entry.clear();resolve!({windows:['old connection']});await refresh;
  assert.equal(entry.snapshot.data,null);
});
