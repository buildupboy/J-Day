import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { createJsonStore } from '../src/store/index.js';
import { createTasksRouter } from '../src/routes/tasks.js';
import { createScheduleRouter } from '../src/routes/schedule.js';

const time = '2026-10-30T15:00:30+09:00';
function fixture() { return { user:{settings:{dayStart:'07:00',dayEnd:'24:00',minSlotMinutes:30,maxBlockMinutes:90,breakMinutes:10}},tasks:[],fixedBlocks:[{id:'class',kind:'class',title:'수업',dayOfWeek:[5],start:'10:00',end:'13:00'}],scheduledBlocks:[],history:[{id:'h1',type:'coding',taskTitle:'old',estimatedMinutes:100,actualMinutes:150,completedAt:time}] }; }
const input = (extra={}) => ({id:'task',title:'과제',type:'coding',deadline:'2026-11-04T23:59:00+09:00',baseEstimatedMinutes:100,subtasks:[{id:'s1',title:'설계',estimatedMinutes:50},{id:'s2',title:'구현',estimatedMinutes:50}],...extra});
async function setup(t, data=fixture()) {
 const dir=await mkdtemp(path.join(os.tmpdir(),'j-day-flow-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const dbPath=path.join(dir,'db.json'),seedPath=path.join(dir,'seed.json');
 await writeFile(seedPath,JSON.stringify(data));
 const store=createJsonStore({dbPath,seedPath});
 await store.initStore();
 let current=new Date(time);
 const now=()=>new Date(current);
 const app=express();app.use(express.json());
 app.use('/api/tasks',createTasksRouter({...store,now}));
 app.use('/api/schedule',createScheduleRouter({...store,now}));
 app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const base=`http://127.0.0.1:${server.address().port}/api`;
 async function request(method,url,body) {
  const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 }
 return {store,request,dbPath,now,setNow:value=>{current=new Date(value);}};
}

test('오늘·주간 조회는 KST, 고정 일정과 하위작업명 포함, 읽기 전용',async t=>{
 const {store,request,dbPath,setNow}=await setup(t);
 await request('POST','/tasks',input());
 await store.updateDb(db=>({...db,scheduledBlocks:[{id:'existing-ai',taskId:'task',subtaskId:'s1',date:'2026-10-30',start:'15:01',end:'16:16',status:'planned',source:'ai'}]}));
 const before=await readFile(dbPath,'utf8');
 const today=await request('GET','/schedule/today?explain=true');
 assert.equal(today.status,200);assert.equal(today.body.date,'2026-10-30');
 assert.equal(today.body.items.find(i=>i.source==='fixed').title,'수업');
 assert.equal(today.body.items.find(i=>i.source==='scheduled').title,'설계');
 assert.ok(today.body.explanations.blocks.length>0);
 const week=await request('GET','/schedule/week');
 assert.equal(week.body.from,'2026-10-26');assert.equal(week.body.to,'2026-11-01');assert.equal(week.body.days.length,7);
 const custom=await request('GET','/schedule/week?from=2026-11-01');
 assert.equal(custom.body.to,'2026-11-07');
 assert.equal((await request('GET','/schedule/week?from=2026-02-30')).status,400);
 assert.equal((await request('GET','/schedule/today?explain=yes')).status,400);
 setNow('2026-10-30T16:00:00Z');
 assert.equal((await request('GET','/schedule/today')).body.date,'2026-10-31');
 assert.equal(await readFile(dbPath,'utf8'),before);
 assert.equal((await store.readDb()).tasks.length,1);
});

test('명시적 블록 완료와 재배치 응답 설명',async t=>{
 const {store,request,setNow}=await setup(t);
 const created=await request('POST','/tasks',input());
 const block={id:'existing-ai',taskId:'task',subtaskId:'s1',date:'2026-10-30',start:'15:01',end:'16:16',status:'planned',source:'ai'};
 await store.updateDb(db=>({...db,scheduledBlocks:[block]}));
 setNow('2026-10-30T16:00:00+09:00');
 const reported=await request('PATCH','/tasks/task/progress',{blockId:block.id,blockStatus:'done',progress:0.5,actualMinutes:40});
 assert.equal(reported.status,200);
 assert.ok(reported.body.changes.some(c=>c.type==='updated'&&c.after.id===block.id));
 const response=await request('POST','/schedule/reschedule?explain=true',{reason:'manual'});
 assert.equal(response.status,200);assert.ok(response.body.explanations);
});
