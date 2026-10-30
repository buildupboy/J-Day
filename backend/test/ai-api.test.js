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

test('과제 등록은 AI 대기, 적용 API가 검증된 결과만 저장하고 반복 적용은 멱등',async t=>{
 const {store,request}=await setup(t);
 assert.equal((await request('GET','/schedule/context')).body.schedulingStatus,'not_requested');
 const registered=await request('POST','/tasks?explain=true',input());
 assert.equal(registered.body.rescheduled,false);assert.equal(registered.body.schedulingStatus,'awaiting_ai');
 assert.deepEqual(registered.body.scheduledBlocks,[]);
 const context=registered.body.planningContext;
 assert.equal((await request('GET','/schedule/context')).body.stale,false);
 const body={contextId:context.contextId,blocks:[
  {taskId:'task',subtaskId:'s1',date:'2026-10-30',start:'16:00',end:'17:15',placementReason:'식사 후 작업'},
  {taskId:'task',subtaskId:'s2',date:'2026-10-30',start:'17:25',end:'18:40'},
 ]};
 const applied=await request('POST','/schedule/apply?explain=true',body);
 assert.equal(applied.status,200);assert.equal(applied.body.rescheduled,true);
 assert.deepEqual(applied.body.unplaced,[]);
 assert.equal(applied.body.explanations.blocks[0].reasons[0],'식사 후 작업');
 assert.deepEqual((await store.readDb()).scheduledBlocks,applied.body.scheduledBlocks);
 const today=await request('GET','/schedule/today');
 const displayed=today.body.items.find(item=>item.source==='scheduled');
 assert.equal(displayed.placementSource,'ai');
 const repeated=await request('POST','/schedule/apply',body);
 assert.equal(repeated.status,200);assert.deepEqual(repeated.body.changes,[]);
 assert.equal((await request('GET','/schedule/context')).body.schedulingStatus,'applied');
});

test('잘못된 AI 결과와 오래된 요청은 저장하지 않고 400/409',async t=>{
 const {store,request,dbPath}=await setup(t);
 const created=await request('POST','/tasks',input());
 const contextId=created.body.planningContext.contextId;
 const before=await readFile(dbPath,'utf8');
 for(const body of [{contextId,blocks:'invalid'},{contextId,blocks:[{taskId:'missing',date:'2026-10-30',start:'16:00',end:'17:00'}]},
   {contextId,blocks:[{taskId:'task',subtaskId:'s1',date:'2026-02-30',start:'16:00',end:'17:00'}]}]){
  assert.equal((await request('POST','/schedule/apply',body)).status,400);
  assert.equal(await readFile(dbPath,'utf8'),before);
 }
 await store.updateDb(db=>({...db,user:{...db.user,settings:{...db.user.settings,breakMinutes:20}}}));
 assert.equal((await request('GET','/schedule/context')).body.stale,true);
 const changed=await readFile(dbPath,'utf8');
 assert.equal((await request('POST','/schedule/apply',{contextId,blocks:[]})).status,409);
 assert.equal(await readFile(dbPath,'utf8'),changed);
});

test('AI는 일부만 배치하거나 전부 비울 수 있고 나머지는 서버가 계산',async t=>{
 const {store,request}=await setup(t);
 const created=await request('POST','/tasks',input());
 const partial=await request('POST','/schedule/apply',{contextId:created.body.planningContext.contextId,
   blocks:[{taskId:'task',subtaskId:'s1',date:'2026-10-30',start:'16:00',end:'17:00'}]});
 assert.equal(partial.status,200);assert.deepEqual(partial.body.unplaced,[{taskId:'task',remainingMinutes:90}]);
 const prepared=await request('POST','/schedule/reschedule',{reason:'manual',horizonDays:7});
 assert.equal(prepared.body.planningContext.days.length,7);
 assert.equal(prepared.body.scheduledBlocks.length,1);
 const empty=await request('POST','/schedule/apply',{contextId:prepared.body.planningContext.contextId,blocks:[]});
 assert.equal(empty.status,200);assert.deepEqual(empty.body.unplaced,[{taskId:'task',remainingMinutes:150}]);
 assert.deepEqual((await store.readDb()).scheduledBlocks,[]);
});

test('AI 적용이 끝나기 전 큐는 pending, 검증 후에만 processed',async t=>{
 const {store,request}=await setup(t);
 await store.updateDb(db=>({...db,schedulerRequests:[{id:'queue',status:'pending',reason:'new_task'}]}));
 const result=await request('POST','/tasks',input());
 assert.equal((await store.readDb()).schedulerRequests[0].status,'pending');
 await request('POST','/schedule/apply',{contextId:result.body.planningContext.contextId,blocks:[]});
 assert.equal((await store.readDb()).schedulerRequests[0].status,'processed');
});

test('AI 결과가 과거가 됐거나 새 요청이 생성되면 거부, 기본 등록·완료 기록 유지',async t=>{
 const {store,request,setNow}=await setup(t);
 const created=await request('POST','/tasks',input());
 setNow('2026-10-30T16:01:00+09:00');
 assert.equal((await request('POST','/schedule/apply',{contextId:created.body.planningContext.contextId,blocks:[{taskId:'task',subtaskId:'s1',date:'2026-10-30',start:'16:00',end:'17:00'}]})).status,400);
 const done=await request('PATCH','/tasks/task/progress',{progress:1,actualMinutes:100});
 assert.equal(done.body.task.status,'done');assert.equal(done.body.rescheduled,false);
 assert.equal((await store.readDb()).history.filter(record=>record.taskId==='task').length,1);
 assert.equal((await request('POST','/schedule/apply',{contextId:created.body.planningContext.contextId,blocks:[]})).status,409);
});
