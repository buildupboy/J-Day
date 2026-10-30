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
import { allocate, findFreeSlots } from '../src/scheduler/allocator.js';
import { sleepIntervals } from '../src/scheduler/sleep.js';

const now = new Date('2026-10-30T08:00:00+09:00');
const fixture = () => ({ user: { name: 'Test', settings: { ...DEFAULTS, dayStart: '09:00', dayEnd: '18:00', maxDailyMinutes: 240, bufferMinutes: 15, custom: 'keep' } }, tasks: [{ id:'task', title:'Report', type:'report', estimatedMinutes:300, progress:0, status:'todo', deadline:'2026-11-01T18:00:00+09:00' }], fixedBlocks:[{id:'fixed',kind:'class',dayOfWeek:[5],start:'10:00',end:'11:00'}], scheduledBlocks:[], history:[{id:'keep'}], extra:{keep:true} });
const length = (block) => { const n=(s)=>Number(s.slice(0,2))*60+Number(s.slice(3)); return n(block.end)-n(block.start); };
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
  assert.deepEqual(findFreeSlots('2026-10-30',fixed,[],settings),[{start:'08:00',end:'23:30'}]);
  assert.deepEqual(fixed,before);
  assert.throws(()=>sleepIntervals({sleep:{start:'07:00',end:'07:00'}}));
});
test('sleep overrides available window and preserves minute boundaries',()=>{
  const settings={...DEFAULTS,dayStart:'06:00',dayEnd:'24:00',sleep:{start:'23:30',end:'07:00'},breakMinutes:15,maxBlockMinutes:45,maxDailyMinutes:120};
  const result=allocate(fixture().tasks,[],{from:'2026-10-30',to:'2026-11-01',settings});
  for(const block of result.blocks){assert.ok(block.start>='07:00'&&block.end<='23:30');assert.ok(length(block)<=45);}
  for(const date of new Set(result.blocks.map(b=>b.date))){const blocks=result.blocks.filter(b=>b.date===date);assert.ok(blocks.reduce((s,b)=>s+length(b),0)<=120);for(let i=1;i<blocks.length;i++){const n=s=>Number(s.slice(0,2))*60+Number(s.slice(3));assert.ok(n(blocks[i].start)-n(blocks[i-1].end)>=15);}}
});
test('existing early/balanced distributions remain distinct under sleep settings',()=>{
  const tasks=[{...fixture().tasks[0],estimatedMinutes:180}], settings={...DEFAULTS,dayStart:'09:00',dayEnd:'13:00',sleep:{start:'23:30',end:'07:00'},breakMinutes:0,maxBlockMinutes:60};
  const run=distribution=>allocate(tasks,[],{from:'2026-10-30',to:'2026-11-01',settings:{...settings,distribution}});
  assert.equal(new Set(run('early').blocks.map(b=>b.date)).size,1);
  assert.equal(new Set(run('balanced').blocks.map(b=>b.date)).size,3);
});
test('invalid patches rejected, unrelated settings maintained',()=>{
  for(const patch of [{dayStart:'22:00',dayEnd:'09:00'},{dayStart:'25:00'},{sleep:{start:'07:00',end:'07:00'}},{sleep:{start:'23:99',end:'07:00'}},{maxBlockMinutes:15},{maxDailyMinutes:-1},{breakMinutes:1.5},{distribution:'unknown'},{unknown:true},{}])assert.throws(()=>mergeSettings(fixture().user.settings,patch),{status:400});
  const updated=mergeSettings(fixture().user.settings,{breakMinutes:20});assert.equal(updated.custom,'keep');assert.equal(updated.bufferMinutes,15);assert.equal(updated.maxDailyMinutes,240);
});
test('GET is read-only and PATCH persists settings plus reallocation together',async t=>{
  const {store,request,url}=await setup(t);const before=await store.readDb();
  assert.equal((await (await fetch(url)).json()).settings.breakMinutes,10);
  assert.deepEqual(await store.readDb(),before);
  const response=await request({breakMinutes:20,sleep:{start:'23:30',end:'07:00'}});assert.equal(response.status,200);
  const result=await response.json(),saved=await store.readDb();
  assert.equal(saved.user.settings.breakMinutes,20);assert.deepEqual(saved.user.settings.sleep,{start:'23:30',end:'07:00'});
  assert.ok(saved.scheduledBlocks.length>0);assert.deepEqual(saved.fixedBlocks,before.fixedBlocks);assert.deepEqual(saved.history,before.history);assert.deepEqual(saved.extra,before.extra);assert.deepEqual(saved.tasks,before.tasks);
  assert.equal((await (await fetch(url)).json()).settings.breakMinutes,20);assert.equal(result.settings.custom,'keep');
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
test('future plans update, past/completed/current blocks preserved, unplaced reported',async t=>{
  const {store,request}=await setup(t,{now:()=>new Date('2026-10-30T09:30:00+09:00')});
  const data=fixture();data.tasks.push({id:'done-task',estimatedMinutes:60,status:'done',progress:1,deadline:'2026-10-29T18:00:00+09:00'});
  data.scheduledBlocks=[{id:'done',taskId:'done-task',date:'2026-10-29',start:'09:00',end:'10:00',status:'done'},{id:'ongoing',taskId:'task',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned'},{id:'future',taskId:'task',date:'2026-10-31',start:'09:00',end:'10:00',status:'planned'}];
  await store.writeDb(data);
  const response=await request({dayStart:'11:00',dayEnd:'12:00',maxDailyMinutes:30});assert.equal(response.status,200);const result=await response.json();const saved=await store.readDb();
  assert.deepEqual(saved.scheduledBlocks.find(b=>b.id==='done'),data.scheduledBlocks[0]);assert.deepEqual(saved.scheduledBlocks.find(b=>b.id==='ongoing'),data.scheduledBlocks[1]);
  assert.ok(!saved.scheduledBlocks.some(b=>b.id==='future'));assert.ok(result.unplaced.length>0);assert.equal(result.unplaced[0].title,'Report');
  for(const block of saved.scheduledBlocks.filter(b=>!['done','ongoing'].includes(b.id)))assert.ok(block.start>='11:00'&&block.end<='12:00');
});

test('fixed rest periods exclude lunch and overnight intervals without double subtraction',()=>{
  const settings={...DEFAULTS,dayStart:'00:00',dayEnd:'24:00',sleep:{start:'23:00',end:'07:00'},restPeriods:[{start:'12:00',end:'13:00'},{start:'12:30',end:'13:30'},{start:'23:30',end:'08:00'}]};
  const fixed=[{id:'class',dayOfWeek:[5],start:'12:00',end:'14:00'}];
  assert.deepEqual(findFreeSlots('2026-10-30',fixed,[],settings),[{start:'08:00',end:'12:00'},{start:'14:00',end:'23:00'}]);
  for(const restPeriods of [null,[{start:'12:00',end:'12:00'}],[{start:'25:00',end:'13:00'}],Array.from({length:9},()=>({start:'12:00',end:'13:00'}))])assert.throws(()=>mergeSettings(DEFAULTS,{restPeriods}),{status:400});
});
test('fixed rest is saved and reflected by reallocation; deleting it restores availability',async t=>{
  const {store,request,url}=await setup(t);const db=fixture();db.user.settings={...DEFAULTS,dayStart:'09:00',dayEnd:'15:00',breakMinutes:0,maxBlockMinutes:90};db.tasks[0].estimatedMinutes=300;db.tasks[0].deadline='2026-10-30T15:00:00+09:00';db.fixedBlocks=[];await store.writeDb(db);
  const response=await request({restPeriods:[{start:'10:00',end:'13:00'}]});assert.equal(response.status,200);const result=await response.json();
  assert.ok(result.unplaced.length>0);assert.equal(result.settings.breakMinutes,0);
  for(const block of (await store.readDb()).scheduledBlocks)assert.ok(block.end<='10:00'||block.start>='13:00');
  assert.deepEqual((await (await fetch(url)).json()).settings.restPeriods,[{start:'10:00',end:'13:00'}]);
  const cleared=await request({restPeriods:[]});assert.equal(cleared.status,200);assert.deepEqual((await cleared.json()).unplaced,[]);
  assert.equal((await store.readDb()).scheduledBlocks.reduce((sum,b)=>sum+length(b),0),300);
});

test('four preferred periods each cover six hours and guide first placement',()=>{
  const expected={dawn:'00:00',morning:'06:00',daytime:'12:00',evening:'18:00'};
  const task={...fixture().tasks[0],estimatedMinutes:60,deadline:'2026-10-31T00:00:00+09:00'};
  for(const [preferredPeriod,start] of Object.entries(expected)){
    const settings={...DEFAULTS,dayStart:'00:00',dayEnd:'24:00',breakMinutes:0,preferredPeriod};
    const result=allocate([task],[],{from:'2026-10-30',to:'2026-10-30',settings});
    assert.equal(result.blocks[0].start,start);assert.deepEqual(result.unplaced,[]);
  }
  for(const preferredPeriod of ['afternoon','toString',['morning'],3])assert.throws(()=>mergeSettings(DEFAULTS,{preferredPeriod}),{status:400});
});
test('preference respects deadlines, sleep and short boundary slots with fallback',()=>{
  const run=(settings,task=fixture().tasks[0])=>allocate([{...task,estimatedMinutes:45,deadline:'2026-10-30T12:30:00+09:00'}],[],{from:'2026-10-30',to:'2026-10-30',settings:{...DEFAULTS,breakMinutes:0,...settings}});
  const beforeDeadline=run({dayStart:'09:00',dayEnd:'22:00',preferredPeriod:'evening'});assert.equal(beforeDeadline.blocks[0].start,'09:00');
  const short=run({dayStart:'11:45',dayEnd:'12:30',preferredPeriod:'morning'});assert.deepEqual(short.unplaced,[]);assert.equal(length(short.blocks[0]),45);
  const sleeping=run({dayStart:'00:00',dayEnd:'14:00',preferredPeriod:'dawn',sleep:{start:'23:00',end:'07:00'}});assert.equal(sleeping.blocks[0].start,'07:00');
});
test('preferred slot reordering retains break gaps and prevents overlapping assignments',()=>{
  const settings={...DEFAULTS,dayStart:'09:00',dayEnd:'24:00',breakMinutes:10,maxBlockMinutes:60,preferredPeriod:'evening'};
  const task={...fixture().tasks[0],estimatedMinutes:600,deadline:'2026-10-31T00:00:00+09:00'};
  const result=allocate([task],[],{from:'2026-10-30',to:'2026-10-30',settings});
  const min=s=>Number(s.slice(0,2))*60+Number(s.slice(3));
  assert.deepEqual(result.unplaced,[]);
  for(let i=1;i<result.blocks.length;i++)assert.ok(min(result.blocks[i].start)-min(result.blocks[i-1].end)>=10);
});
test('preferred period persists through settings API and affects saved future plan',async t=>{
  const {request,store,url}=await setup(t);
  const response=await request({preferredPeriod:'daytime'});assert.equal(response.status,200);
  assert.equal((await response.json()).settings.preferredPeriod,'daytime');
  assert.equal((await (await fetch(url)).json()).settings.preferredPeriod,'daytime');
  assert.equal((await store.readDb()).scheduledBlocks[0].start,'12:00');
});
