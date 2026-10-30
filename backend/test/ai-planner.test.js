import test from 'node:test';
import assert from 'node:assert/strict';
import { planningModelInput, createAiPlanner } from '../src/services/ai-planner.js';
import { reschedule } from '../src/scheduler/rescheduler.js';
import { acceptAiPlan } from '../src/scheduler/ai-plan.js';
import { mergeSettings } from '../src/services/user-settings.js';
const now = new Date('2026-10-31T09:00:00+09:00');
function fixture() { return { user: { settings: { dayStart:'07:00',dayEnd:'24:00',minSlotMinutes:30,maxBlockMinutes:90,breakMinutes:10,maxDailyMinutes:240,bufferMinutes:30,distribution:'early',sleep:{start:'14:00',end:'15:00'},restPeriods:[{start:'12:00',end:'13:00'}],travelMinutes:20 } }, tasks:[{id:'t',title:'보고서',type:'report',estimatedMinutes:60,baseEstimatedMinutes:60,progress:0,status:'todo',deadline:'2026-10-31T22:00:00+09:00'}], fixedBlocks:[{id:'class',title:'수업',dayOfWeek:[6],start:'10:00',end:'11:00'}],scheduledBlocks:[],history:[] }; }
const block = (extra={}) => ({taskId:'t',subtaskId:null,date:'2026-10-31',start:'11:20',end:'11:50',placementReason:'이동 이후 작업',...extra});
function prepared(db) { const result=reschedule(db,{now,reason:'manual'}); return {...db,scheduledBlocks:result.scheduledBlocks,aiScheduling:{status:'pending',context:result.planningContext}}; }

test('상대 contextId/taskId 계약으로 실제 AI 호출과 검증·적용 상태 연결',async()=>{
 const db=fixture();let calls=0;
 const planner=createAiPlanner({clock:()=>now,completeFn:async request=>{
  calls++;const input=JSON.parse(request.messages[0].content);
  assert.equal(request.schema.required.includes('contextId'),true);
  assert.equal(input.rankedTasks[0].taskId,'t');
  assert.equal(input.rankedTasks[0].subtasks[0].remainingMinutes,60);
  assert.equal(input.blockedWindows.find(b=>b.kind==='fixed_and_travel').end,'11:20');
  assert.equal(input.settings.restPeriods[0].start,'12:00');
  return JSON.stringify({contextId:input.contextId,blocks:[block({start:'15:00',end:'16:00'})]});
 }});
 const result=await planner(db,{now,reason:'manual'});
 assert.equal(calls,1);assert.equal(result.schedulingStatus,'applied');
 assert.equal(db.aiScheduling.status,'applied');assert.equal(result.unplaced.length,0);
 assert.equal(result.scheduledBlocks[0].taskId,'t');
 const repeated=acceptAiPlan(db,{contextId:db.aiScheduling.context.contextId,blocks:[block({start:'15:00',end:'16:00'})]},{now});
 assert.deepEqual(repeated.changes,[]);
});

test('수면·고정 휴식·이동시간을 빈 구간 계산과 적용 검증에서 모두 보호',()=>{
 const db=prepared(fixture());
 for(const [start,end] of [['12:00','12:30'],['14:00','14:30'],['11:00','11:20']]) {
  assert.throws(()=>acceptAiPlan(db,{contextId:db.aiScheduling.context.contextId,blocks:[block({start,end})]},{now}),/고정 일정·이동·수면·지정 휴식/);
  assert.ok(!db.aiScheduling.context.days[0].slots.some(s=>s.start<=start&&s.end>=end));
 }
});

test('모델 오류는 한번 교정하고 최종 실패는 DB 입력을 보존',async()=>{
 const db=fixture(),before=structuredClone(db);let calls=0;
 const planner=createAiPlanner({clock:()=>now,completeFn:async request=>{
  const input=JSON.parse(request.messages[0].content);calls++;
  if(calls===2)assert.match(request.messages.at(-1).content,/validationErrors/);
  return JSON.stringify({contextId:input.contextId,blocks:[block(calls===1?{start:'12:00',end:'12:30'}:{start:'15:00',end:'16:00'})]});
 }});
 assert.equal((await planner(db,{now,reason:'manual'})).schedulingStatus,'applied');assert.equal(calls,2);
 const bad=createAiPlanner({clock:()=>now,completeFn:async request=>JSON.stringify({contextId:JSON.parse(request.messages[0].content).contextId,blocks:[block({start:'12:00',end:'12:30'})]})});
 const original=structuredClone(before);
 await assert.rejects(bad(original,{now,reason:'manual'}),/기존 일정은 유지/);assert.deepEqual(original,before);
});

test('실제 적용 시각을 확인해 AI 대기 중 과거가 된 제안을 교정',async()=>{
 const db=fixture();let calls=0;
 const planner=createAiPlanner({clock:()=>new Date('2026-10-31T09:05:00+09:00'),completeFn:async request=>{
  calls++;return JSON.stringify({contextId:JSON.parse(request.messages[0].content).contextId,blocks:[block(calls===1?{start:'09:00',end:'09:30'}:{start:'15:00',end:'16:00'})]});
 }});
 const result=await planner(db,{now,reason:'manual'});assert.equal(calls,2);assert.equal(result.scheduledBlocks[0].start,'15:00');
});

test('하위작업 선행 순서·미배치량·날짜 경계 이동과 휴식 검증',()=>{
 const data=fixture();data.tasks[0].subtasks=[{id:'s1',title:'조사',estimatedMinutes:30,done:false},{id:'s2',title:'작성',estimatedMinutes:30,done:false}];
 const db=prepared(data);
 assert.throws(()=>acceptAiPlan(db,{contextId:db.aiScheduling.context.contextId,blocks:[block({subtaskId:'s2'})]},{now}),/선행/);
 const partial=acceptAiPlan(db,{contextId:db.aiScheduling.context.contextId,blocks:[block({subtaskId:'s1'})]},{now});
 assert.equal(partial.unplaced[0].remainingMinutes,30);
 const next=fixture();next.fixedBlocks=[{id:'late',title:'야간',dayOfWeek:[5],start:'23:00',end:'24:00'}];
 const p=prepared(next);
 assert.ok(p.aiScheduling.context.blockedWindows.some(b=>b.date==='2026-10-31'&&b.start==='00:00'&&b.end==='00:20'));
});

test('사용자 설정 API는 비동기 AI 결과를 저장하고 실패 시 원자적 취소',async t=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const express=(await import('express')).default;const {once}=await import('node:events');
 const {createJsonStore}=await import('../src/store/index.js');const {createUserSettingsRouter}=await import('../src/routes/user-settings.js');
 const directory=await mkdtemp(path.join(os.tmpdir(),'merged-ai-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const seedPath=path.join(directory,'seed.json');await writeFile(seedPath,JSON.stringify(fixture()));
 const store=createJsonStore({seedPath,dbPath:path.join(directory,'db.json')});let fail=false;
 const planner=createAiPlanner({clock:()=>now,completeFn:async request=>{
  if(fail)throw new Error('AI unavailable');return JSON.stringify({contextId:JSON.parse(request.messages[0].content).contextId,blocks:[block({start:'15:00',end:'16:00'})]});
 }});
 const app=express();app.use(express.json());app.use('/user',createUserSettingsRouter({...store,now:()=>now,scheduler:planner}));
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const save=settings=>fetch(`http://127.0.0.1:${server.address().port}/user/settings`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings,confirmReschedule:true})});
 const response=await save({travelMinutes:25,breakMinutes:15});assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.schedulingStatus,'applied');assert.equal(result.settings.travelMinutes,25);
 assert.equal((await store.readDb()).aiScheduling.status,'applied');
 const before=await store.readDb();fail=true;assert.equal((await save({breakMinutes:20})).status,500);assert.deepEqual(await store.readDb(),before);
});

test('수면/휴식 설정 변경 후에도 준비 문맥을 보관',async t=>{
 const settings=mergeSettings(fixture().user.settings,{travelMinutes:30,bufferMinutes:60});
 assert.equal(settings.travelMinutes,30);assert.equal(settings.bufferMinutes,60);
 assert.throws(()=>mergeSettings(settings,{travelMinutes:-1}));
});


test('유효하지만 잔량이 남은 계획도 한 번 재검토하고 더 완전한 계획 선택',async()=>{
 const db=fixture();let calls=0;
 const planner=createAiPlanner({clock:()=>now,completeFn:async request=>{
  calls++;if(calls===2)assert.match(request.messages.at(-1).content,/reviewUnplaced/);
  return JSON.stringify({contextId:JSON.parse(request.messages[0].content).contextId,blocks:[block(calls===1?{}:{start:'15:00',end:'16:00'})]});
 }});
 const result=await planner(db,{now,reason:'manual'});assert.equal(calls,2);assert.equal(result.unplaced.length,0);
});

test('재검토가 실패해도 최초의 유효한 부분 계획을 다시 검증해 적용',async()=>{
 const db=fixture();let calls=0;
 const planner=createAiPlanner({clock:()=>now,completeFn:async request=>{
  calls++;return JSON.stringify({contextId:JSON.parse(request.messages[0].content).contextId,blocks:[block(calls===1?{}:{start:'12:00',end:'12:30'})]});
 }});
 const result=await planner(db,{now,reason:'manual'});assert.equal(calls,2);assert.equal(result.unplaced[0].remainingMinutes,30);assert.equal(db.aiScheduling.status,'applied');
});


test('모델 입력은 contextId와 제약을 유지하며 과거 설명 및 중복 메타데이터 축소', () => {
 const db = prepared(fixture()), context = db.aiScheduling.context;
 context.existingFutureBlocks = [{ id:'old',taskId:'t',date:'2026-10-31',start:'15:00',end:'16:00',status:'planned',placementReason:'반복 설명' }];
 const input=planningModelInput(context);
 assert.equal(input.contextId,context.contextId);assert.deepEqual(input.rankedTasks,context.rankedTasks);
 assert.deepEqual(input.blockedWindows,context.blockedWindows);assert.deepEqual(input.days,context.days);
 assert.equal(input.existingFutureBlocks[0].placementReason,undefined);
 assert.equal(context.existingFutureBlocks[0].placementReason,'반복 설명');
});
