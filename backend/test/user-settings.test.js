import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { createJsonStore } from '../src/store/index.js';
import { createUserSettingsRouter } from '../src/routes/user-settings.js';
import { mergeSettings, DEFAULTS } from '../src/services/user-settings.js';
import { findFreeSlots } from '../src/scheduler/allocator.js';
import { sleepIntervals } from '../src/scheduler/sleep.js';

const now = new Date('2026-10-30T08:00:00+09:00');
const fixture = () => ({ user: { name: 'Test', settings: { ...DEFAULTS, dayStart: '09:00', dayEnd: '18:00', maxDailyMinutes: 240, bufferMinutes: 15, custom: 'keep' } }, tasks: [{ id:'task', title:'Report', type:'report', estimatedMinutes:300, progress:0, status:'todo', deadline:'2026-11-01T18:00:00+09:00' }], fixedBlocks:[{id:'fixed',kind:'class',dayOfWeek:[5],start:'10:00',end:'11:00'}], scheduledBlocks:[], history:[{id:'keep'}], extra:{keep:true} });
async function setup(t, dependencies = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jday-settings-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  const dbPath = path.join(directory,'db.json'), seedPath=path.join(directory,'seed.json');
  await writeFile(seedPath,JSON.stringify(fixture()));
  const store = createJsonStore({dbPath,seedPath});
  const app=express();app.use(express.json());
  app.use('/api/user',createUserSettingsRouter({...store,now:()=>new Date(now),...dependencies}));
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const url=`http://127.0.0.1:${server.address().port}/api/user/settings`;
  const request=(settings, confirmed=true)=>fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings,confirmReschedule:confirmed})});
  return {store,request,url,dbPath};
}

test('sleep supports overnight/daytime; union with fixed blocks does not double-subtract',()=>{
  assert.deepEqual(sleepIntervals({sleep:{start:'23:30',end:'07:00'}}),[{start:'00:00',end:'07:00'},{start:'23:30',end:'24:00'}]);
  assert.deepEqual(sleepIntervals({sleep:{start:'13:00',end:'14:00'}}),[{start:'13:00',end:'14:00'}]);
  const settings={...DEFAULTS,dayStart:'00:00',dayEnd:'24:00',sleep:{start:'23:30',end:'07:00'}};
  const fixed=[{dayOfWeek:[5],start:'06:00',end:'08:00'}];
  const before=structuredClone(fixed);
  assert.deepEqual(findFreeSlots('2026-10-30',fixed,[],settings),[{start:'08:10',end:'23:30'}]);
  assert.deepEqual(fixed,before);
  assert.throws(()=>sleepIntervals({sleep:{start:'07:00',end:'07:00'}}));
});
test('invalid patches rejected, unrelated settings maintained',()=>{
  for(const patch of [{dayStart:'22:00',dayEnd:'09:00'},{dayStart:'25:00'},{sleep:{start:'07:00',end:'07:00'}},{sleep:{start:'23:99',end:'07:00'}},{maxBlockMinutes:15},{maxDailyMinutes:-1},{breakMinutes:1.5},{distribution:'unknown'},{unknown:true},{}])assert.throws(()=>mergeSettings(fixture().user.settings,patch),{status:400});
  const updated=mergeSettings(fixture().user.settings,{breakMinutes:20});assert.equal(updated.custom,'keep');assert.equal(updated.bufferMinutes,15);assert.equal(updated.maxDailyMinutes,240);
});
test('confirmation, validation, scheduling failure and save failure do not persist partial data',async t=>{
  const {store,request,dbPath}=await setup(t);await store.readDb();const before=await readFile(dbPath,'utf8');
  assert.equal((await request({breakMinutes:15},false)).status,409);
  assert.equal((await request({dayStart:'25:00'})).status,400);
  assert.equal(await readFile(dbPath,'utf8'),before);
  const failing=await setup(t,{scheduler:()=>{throw new Error('scheduler failed');}});const initial=await failing.store.readDb();
  assert.equal((await failing.request({breakMinutes:15})).status,500);assert.deepEqual(await failing.store.readDb(),initial);
  const writeFailure=await setup(t,{updateDb:async updater=>{updater(fixture());throw new Error('write failed');}});
  assert.equal((await writeFailure.request({breakMinutes:15})).status,500);
});

test('fixed rest periods exclude lunch and overnight intervals without double subtraction',()=>{
  const settings={...DEFAULTS,dayStart:'00:00',dayEnd:'24:00',sleep:{start:'23:00',end:'07:00'},restPeriods:[{start:'12:00',end:'13:00'},{start:'12:30',end:'13:30'},{start:'23:30',end:'08:00'}]};
  const fixed=[{id:'class',dayOfWeek:[5],start:'12:00',end:'14:00'}];
  assert.deepEqual(findFreeSlots('2026-10-30',fixed,[],settings),[{start:'08:00',end:'11:50'},{start:'14:10',end:'23:00'}]);
  for(const restPeriods of [null,[{start:'12:00',end:'12:00'}],[{start:'25:00',end:'13:00'}],Array.from({length:9},()=>({start:'12:00',end:'13:00'}))])assert.throws(()=>mergeSettings(DEFAULTS,{restPeriods}),{status:400});
});
