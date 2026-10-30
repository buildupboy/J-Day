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
test('confirmation, validation and file save failure do not persist partial data',async t=>{
  const {store,request,dbPath}=await setup(t);await store.readDb();const before=await readFile(dbPath,'utf8');
  assert.equal((await request({breakMinutes:15},false)).status,409);
  assert.equal((await request({dayStart:'25:00'})).status,400);
  assert.equal(await readFile(dbPath,'utf8'),before);
  const writeFailure=await setup(t,{updateDb:async updater=>{await updater(fixture());throw new Error('write failed');}});
  assert.equal((await writeFailure.request({breakMinutes:15})).status,500);
});

test('fixed rest periods exclude lunch and overnight intervals without double subtraction',()=>{
  const settings={...DEFAULTS,dayStart:'00:00',dayEnd:'24:00',sleep:{start:'23:00',end:'07:00'},restPeriods:[{start:'12:00',end:'13:00'},{start:'12:30',end:'13:30'},{start:'23:30',end:'08:00'}]};
  const fixed=[{id:'class',dayOfWeek:[5],start:'12:00',end:'14:00'}];
  assert.deepEqual(findFreeSlots('2026-10-30',fixed,[],settings),[{start:'08:00',end:'11:50'},{start:'14:10',end:'23:00'}]);
  for(const restPeriods of [null,[{start:'12:00',end:'12:00'}],[{start:'25:00',end:'13:00'}],Array.from({length:9},()=>({start:'12:00',end:'13:00'}))])assert.throws(()=>mergeSettings(DEFAULTS,{restPeriods}),{status:400});
});


test('AI failure saves settings, invalidates old context and discards planner mutations',async t=>{
  const {store,request,url}=await setup(t,{scheduler:async candidate=>{
    candidate.tasks[0].title='must not persist';
    candidate.history.length=0;
    candidate.scheduledBlocks.length=0;
    candidate.extra.keep=false;
    throw Object.assign(new Error('sensitive provider error'),{status:503});
  }});
  const initial=await store.readDb();
  initial.scheduledBlocks=[{id:'keep',taskId:'task',date:'2026-10-31',start:'09:00',end:'10:00',status:'planned'}];
  initial.aiScheduling={status:'pending',context:{contextId:'old'}};
  await store.writeDb(initial);
  const response=await request({breakMinutes:15});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.settingsSaved,true);assert.equal(result.schedulingStatus,'failed');
  assert.deepEqual(result.changes,[]);assert.deepEqual(result.unplaced,[]);
  assert.ok(result.schedulingError);assert.ok(!result.schedulingError.includes('sensitive'));
  const expected=structuredClone(initial);expected.user.settings.breakMinutes=15;expected.aiScheduling=null;
  assert.deepEqual(await store.readDb(),expected);
  assert.equal((await (await fetch(url)).json()).settings.breakMinutes,15);
});

test('successful and awaiting AI outcomes remain distinct and all settings round trip',async t=>{
  const pending=await setup(t);
  for(const settings of [{sleep:{start:'23:00',end:'07:00'}},{preferredPeriod:'morning'},{dayStart:'08:00',dayEnd:'20:00'},{maxBlockMinutes:60,maxDailyMinutes:120,distribution:'balanced'},{breakMinutes:15,restPeriods:[{start:'12:00',end:'13:00'}]}]){
    const response=await pending.request(settings);assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.settingsSaved,true);assert.equal(result.schedulingStatus,'awaiting_ai');
    const read=await (await fetch(pending.url)).json();
    for(const [key,value] of Object.entries(settings))assert.deepEqual(read.settings[key],value);
  }
  const applied=await setup(t,{scheduler:async db=>({rescheduled:true,schedulingStatus:'applied',scheduledBlocks:db.scheduledBlocks,changes:[],unplaced:[{taskId:'task',remainingMinutes:30}]})});
  const result=await (await applied.request({breakMinutes:20})).json();
  assert.equal(result.schedulingStatus,'applied');assert.equal(result.settingsSaved,true);
  assert.equal(result.unplaced[0].title,'Report');
});


test('rest overlap is rejected before AI and leaves the JSON unchanged',async t=>{
  let calls=0;
  const {store,request,dbPath}=await setup(t,{scheduler:()=>{calls++;throw new Error('must not run');}});
  await store.readDb();const before=await readFile(dbPath,'utf8');
  for(const period of [{start:'10:30',end:'11:30'},{start:'09:00',end:'12:00'},{start:'10:00',end:'11:00'},{start:'23:00',end:'10:30'}]){
    const response=await request({breakMinutes:15,restPeriods:[period]});assert.equal(response.status,409);
    assert.match((await response.json()).error,/다른 시간을 선택/);
    assert.equal(await readFile(dbPath,'utf8'),before);
  }
  assert.equal(calls,0);
});

test('rest overlap handles overnight, every fixed kind, and touching boundaries',async()=>{
  const {restConflictMessage}=await import('../../shared/rest-conflicts.js');
  const fixed=[{title:'아침 수업',kind:'class',dayOfWeek:[1],start:'06:00',end:'07:00'}];
  assert.match(restConflictMessage([{start:'23:30',end:'06:30'}],fixed),/아침 수업/);
  assert.equal(restConflictMessage([{start:'23:30',end:'06:00'}],fixed),null);
  assert.equal(restConflictMessage([{start:'07:00',end:'08:00'}],fixed),null);
  assert.equal(restConflictMessage([],fixed),null);
  assert.equal(restConflictMessage([{start:'12:00',end:'13:00'}],fixed),null);
  for(const kind of ['class','job','routine']) assert.ok(restConflictMessage([{start:'06:30',end:'07:30'}],[{...fixed[0],kind}]));
  assert.equal(restConflictMessage([{start:'06:30',end:'07:30'}],[{...fixed[0],dayOfWeek:[]}]),null);
});
