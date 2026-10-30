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

test('과제 등록 → 개인 보정 → 저장·자동 배치·설명, 원본 추정시간 보존',async t=>{
 const {store,request}=await setup(t);
 const result=await request('POST','/tasks?explain=true',input());
 assert.equal(result.status,201);
 assert.equal(result.body.task.baseEstimatedMinutes,100);
 assert.equal(result.body.task.estimatedMinutes,150);
 assert.match(result.body.task.createdAt,/\+09:00$/);
 assert.ok(result.body.scheduledBlocks.every(b=>b.taskId==='task'));
 assert.equal(result.body.explanations.blocks[0].title,'설계');
 const saved=await store.readDb();
 assert.deepEqual(saved.scheduledBlocks,result.body.scheduledBlocks);
 assert.equal(saved.tasks.length,1);
 assert.equal((await request('GET','/tasks')).body.length,1);
 assert.equal((await request('POST','/tasks',input())).status,409);
 assert.equal((await store.readDb()).tasks.length,1);
});

test('진행 보고와 하위작업 완료 → 재배치, 완료 기록 및 누적 시간 중복 방지',async t=>{
 const {store,request,setNow}=await setup(t);
 await request('POST','/tasks',input());
 setNow('2026-10-30T16:00:00+09:00');
 const first=await request('PATCH','/tasks/task/progress?explain=true',{progress:0.5,actualMinutes:40,subtaskId:'s1',subtaskDone:true});
 assert.equal(first.status,200);
 assert.equal(first.body.task.progress,0.5);
 assert.equal(first.body.task.status,'in_progress');
 assert.ok(first.body.changes.some(c=>c.type==='updated'&&c.after.status==='done'));
 await request('PATCH','/tasks/task/progress',{progress:0.5,actualMinutes:40});
 assert.equal((await store.readDb()).tasks[0].actualMinutes,40);
 const completed=await request('PATCH','/tasks/task/progress',{subtaskId:'s2',subtaskDone:true,actualMinutes:100});
 assert.equal(completed.status,200);
 assert.equal(completed.body.task.status,'done');
 assert.equal(completed.body.task.progress,1);
 assert.ok(completed.body.task.subtasks.every(s=>s.done));
 const history=(await store.readDb()).history.filter(h=>h.taskId==='task');
 assert.equal(history.length,1);assert.equal(history[0].estimatedMinutes,100);assert.equal(history[0].actualMinutes,100);
 await request('PATCH','/tasks/task/progress',{progress:1,actualMinutes:100});
 assert.equal((await store.readDb()).history.length,2);
 assert.equal((await request('PATCH','/tasks/task/progress',{progress:0.5})).status,409);
 const next=await request('POST','/tasks',input({id:'next'}));
 assert.equal(next.body.task.estimatedMinutes,125);
});

test('잘못된 등록·진행 보고는 400/404, 파일은 변경하지 않음',async t=>{
 const {request,dbPath}=await setup(t);
 const before=await readFile(dbPath,'utf8');
 for(const bad of [null,{},input({baseEstimatedMinutes:-1}),input({deadline:'2026-02-30T12:00:00+09:00'}),input({importance:4}),input({subtasks:[{id:'x',title:'x',estimatedMinutes:0}]}),input({type:'unknown'}),input({review:true})]){
  assert.equal((await request('POST','/tasks',bad)).status,400);
  assert.equal(await readFile(dbPath,'utf8'),before);
 }
 assert.equal((await request('PATCH','/tasks/missing/progress',{progress:1})).status,404);
 await request('POST','/tasks',input());
 const created=await readFile(dbPath,'utf8');
 for(const bad of [{},{progress:2},{actualMinutes:-1},{subtaskDone:true},{blockId:'missing',blockStatus:'done'}]) {
  assert.ok([400,404].includes((await request('PATCH','/tasks/task/progress',bad)).status));
  assert.equal(await readFile(dbPath,'utf8'),created);
 }
 assert.equal((await request('PATCH','/tasks/task/progress',{actualMinutes:0,subtaskId:'missing'})).status,404);
});

test('시험 등록 시 복습 포함, 재요청 중복 방지, 진행 완료 상태 보존',async t=>{
 const {store,request}=await setup(t);
 const created=await request('POST','/tasks',input({type:'exam',review:{daysBefore:[3,1],minutes:30}}));
 assert.equal(created.status,201);assert.equal(created.body.reviewTasks.length,2);
 const ids=created.body.reviewTasks.map(t=>t.id);
 await request('PATCH',`/tasks/${ids[0]}/progress`,{progress:1,actualMinutes:20});
 const again=await request('POST','/tasks/task/reviews',{daysBefore:[3,1],minutes:30});
 assert.equal(again.status,200);
 assert.equal((await store.readDb()).tasks.length,3);
 assert.equal(again.body.reviewTasks[0].status,'done');
 assert.equal((await store.readDb()).history.filter(h=>h.taskId===ids[0]).length,0);
 const before=await store.readDb();
 assert.equal((await request('POST','/tasks/task/reviews',{daysBefore:[1],minutes:60})).status,409);
 assert.deepEqual(await store.readDb(),before);
});

test('오늘·주간 조회는 KST, 고정 일정과 하위작업명 포함, 읽기 전용',async t=>{
 const {store,request,dbPath,setNow}=await setup(t);
 await request('POST','/tasks',input());
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
 const {request,setNow}=await setup(t);
 const created=await request('POST','/tasks',input());
 const block=created.body.scheduledBlocks[0];
 setNow('2026-10-30T16:00:00+09:00');
 const reported=await request('PATCH','/tasks/task/progress',{blockId:block.id,blockStatus:'done',progress:0.5,actualMinutes:40});
 assert.equal(reported.status,200);
 assert.ok(reported.body.changes.some(c=>c.type==='updated'&&c.after.id===block.id));
 const response=await request('POST','/schedule/reschedule?explain=true',{reason:'manual'});
 assert.equal(response.status,200);assert.ok(response.body.explanations);
});

test('동시 등록과 진행 보고가 다른 작업·기록을 유실하지 않음',async t=>{
 const {store,request}=await setup(t);
 const created=await Promise.all(['one','two','three'].map(id=>request('POST','/tasks',input({id}))));
 assert.ok(created.every(r=>r.status===201));
 const done=await Promise.all(['one','two','three'].map(id=>request('PATCH',`/tasks/${id}/progress`,{progress:1,actualMinutes:90})));
 assert.ok(done.every(r=>r.status===200));
 const saved=await store.readDb();
 assert.equal(saved.tasks.length,3);assert.ok(saved.tasks.every(t=>t.status==='done'));
 assert.equal(saved.history.length,4);assert.equal(new Set(saved.history.map(h=>h.id)).size,4);
});
