import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, findFreeSlots } from '../src/scheduler/allocator.js';
import { rankTasks, preparePlanningContext, schedulingRevision } from '../src/scheduler/planning-context.js';
import { schedulingWeight } from '../src/scheduler/weight.js';
import { reschedule, detectMissedBlocks } from '../src/scheduler/rescheduler.js';
import { acceptAiPlan } from '../src/scheduler/ai-plan.js';

const now = new Date('2026-10-30T08:30:00+09:00');
function data() { return { user:{settings:{dayStart:'09:00',dayEnd:'18:00',minSlotMinutes:30,maxBlockMinutes:90,breakMinutes:10,maxDailyMinutes:180,bufferMinutes:60}},
  fixedBlocks:[{id:'class',kind:'class',dayOfWeek:[5],title:'수업',start:'12:00',end:'13:00'}],
  tasks:[{id:'a',title:'과제',type:'coding',deadline:'2026-11-01T18:00:00+09:00',estimatedMinutes:120,progress:0,status:'todo',subtasks:[{id:'s1',title:'설계',estimatedMinutes:60,done:false},{id:'s2',title:'구현',estimatedMinutes:60,done:false}]}], scheduledBlocks:[],history:[] }; }
function prepared(value=data(),options={}) { const result=reschedule(value,{now,reason:'manual',...options});return {...value,scheduledBlocks:result.scheduledBlocks,aiScheduling:{status:'pending',context:result.planningContext}}; }
const block=(extra={})=>({taskId:'a',subtaskId:'s1',date:'2026-10-30',start:'09:00',end:'10:00',...extra});
function plan(db,blocks=[block(),block({subtaskId:'s2',start:'10:10',end:'11:10'})]) { return {contextId:db.aiScheduling.context.contextId,blocks}; }
function rejected(db,blocks,status=400,current=now){assert.throws(()=>acceptAiPlan(db,plan(db,blocks),{now:current}),error=>error.status===status);}

test('기존 allocate는 시각을 만들지 않고 명시적으로 비활성화',()=>{
 assert.throws(()=>allocate([],[],{}),error=>error.code==='RULE_BASED_ALLOCATION_DISABLED');
 assert.deepEqual(findFreeSlots('2026-10-30',[],[],data().user.settings),[{start:'09:00',end:'18:00'}]);
});
test('참고 우선순위는 점수순(마감 임박·작업량·중요도·짧은 잔여량)이며 동점은 입력순, 완료 제외',()=>{
 const base=data().tasks[0],make=(id,estimatedMinutes,extra={})=>({...base,id,title:id,subtasks:[],estimatedMinutes,...extra});
 const result=rankTasks([make('long',90),make('short',30),make('same',30),make('important',120,{importance:3}),make('urgent',120,{deadline:'2026-10-31T18:00:00+09:00'}),make('done',60,{status:'done'})],{now});
 assert.deepEqual(result.map(t=>t.taskId),['important','urgent','short','same','long']);
 assert.ok(result.every(t=>!Object.hasOwn(t,'start')&&!Object.hasOwn(t,'end')));
});
test('마감이 하루 늦어도 훨씬 중요한 작업이 먼저, 같은 조건이면 마감·중요도·짧은 순',()=>{
 const base=data().tasks[0],make=(id,extra={})=>({...base,id,title:id,subtasks:[],estimatedMinutes:60,importance:2,...extra});
 const a=make('a',{importance:1,deadline:'2026-10-31T18:00:00+09:00'}),b=make('b',{importance:3,deadline:'2026-11-01T18:00:00+09:00'});
 assert.deepEqual(rankTasks([a,b],{now}).map(t=>t.taskId),['b','a']);
 // 작업량이 큰 쪽(마감이 더 멀어도 시간이 빠듯함)이 앞선다
 const big=make('big',{estimatedMinutes:900,deadline:'2026-11-02T18:00:00+09:00'}),small=make('small',{estimatedMinutes:30,deadline:'2026-11-01T18:00:00+09:00'});
 assert.deepEqual(rankTasks([small,big],{now}).map(t=>t.taskId),['big','small']);
 // 마감이 지난 작업은 항상 맨 앞
 assert.equal(rankTasks([make('late',{deadline:'2026-10-29T18:00:00+09:00'}),make('hot',{importance:3,deadline:'2026-10-30T10:00:00+09:00'})],{now})[0].taskId,'late');
 // 점수 동점이면 입력 순서를 유지
 assert.deepEqual(rankTasks([make('x'),make('y')],{now}).map(t=>t.taskId),['x','y']);
});
test('schedulingWeight는 잘못된 입력을 거부하고 now에 의존하지 않는 순수 함수',()=>{
 const input={importance:2,deadline:'2026-11-01T18:00:00+09:00',remainingMinutes:60,now};
 assert.equal(schedulingWeight(input),schedulingWeight({...input}));
 assert.throws(()=>schedulingWeight({...input,remainingMinutes:0}),RangeError);
 assert.throws(()=>schedulingWeight({...input,importance:4}),RangeError);
 assert.throws(()=>schedulingWeight({...input,deadline:'x'}),RangeError);
});
test('하위작업·진행률·진행 중 예약량을 반영하되 새 블록은 만들지 않음',()=>{
 const db=data();db.tasks[0].progress=0.5;db.tasks[0].subtasks[0].done=true;
 db.scheduledBlocks=[{id:'active',...block({subtaskId:'s2',start:'09:00',end:'10:00'}),status:'planned'}];
 const context=preparePlanningContext(db,{now:new Date('2026-10-30T09:30:00+09:00')});
 assert.equal(context.rankedTasks[0].remainingMinutes,30);
 assert.equal(context.protectedBlocks[0].id,'active');
 assert.equal(context.rankedTasks[0].subtasks[1].remainingMinutes,30);
});
test('AI 입력은 빈 구간·제약·기존 블록을 전달하며 입력 불변',()=>{
 const db=data();db.scheduledBlocks=[{id:'future',...block({start:'15:00',end:'16:00'}),status:'planned'}];const before=structuredClone(db);
 const result=reschedule(db,{now,reason:'manual'}),context=result.planningContext;
 assert.equal(result.rescheduled,false);assert.equal(result.schedulingStatus,'awaiting_ai');
 assert.deepEqual(result.scheduledBlocks,db.scheduledBlocks);assert.deepEqual(result.unplaced,[]);
 assert.deepEqual(context.replaceableBlockIds,['future']);assert.equal(context.priorityIsAdvisory,true);
 assert.equal(context.days.length,14);assert.equal(context.days[0].requiredBufferMinutes,60);
 assert.equal(context.sourceRevision,schedulingRevision(db));assert.deepEqual(db,before);
 assert.equal(JSON.parse(JSON.stringify(context)).contextId,context.contextId);
});
test('미수행 상태만 갱신하고 미래 계획·완료 기록을 보존',()=>{
 const db=data();db.scheduledBlocks=[{id:'past',...block(),status:'planned'},{id:'future',...block({start:'17:00',end:'18:00'}),status:'planned'}];
 const result=reschedule(db,{now:new Date('2026-10-30T15:00:00+09:00'),reason:'missed'});
 assert.equal(result.scheduledBlocks.find(b=>b.id==='past').status,'missed');
 assert.ok(result.scheduledBlocks.some(b=>b.id==='future'));assert.equal(result.scheduledBlocks.length,2);
 assert.equal(detectMissedBlocks(db.scheduledBlocks,db.tasks,new Date('2026-10-30T15:00:00+09:00')).length,1);
});
test('검증된 AI 시각과 이유만 적용하고 보존 기록은 유지',()=>{
 const value=data();value.scheduledBlocks=[{id:'old',...block({date:'2026-10-29'}),status:'done'}];
 const db=prepared(value),before=structuredClone(db),result=acceptAiPlan(db,plan(db,[block({placementReason:'오전 선호 반영'}),block({subtaskId:'s2',start:'10:10',end:'11:10'})]),{now});
 assert.equal(result.rescheduled,true);assert.equal(result.schedulingStatus,'applied');
 assert.equal(result.scheduledBlocks[0].id,'old');assert.equal(result.scheduledBlocks[1].start,'09:00');
 assert.equal(result.scheduledBlocks[1].placementReason,'오전 선호 반영');assert.equal(result.scheduledBlocks[1].source,'ai');
 assert.deepEqual(result.unplaced,[]);assert.deepEqual(db,before);
});
test('부분 배치·빈 배치는 허용하고 미배치량을 서버에서 계산',()=>{
 const db=prepared();const result=acceptAiPlan(db,plan(db,[block({end:'09:30'})]),{now});
 assert.deepEqual(result.unplaced,[{taskId:'a',remainingMinutes:90}]);
 const empty=acceptAiPlan(db,plan(db,[]),{now});assert.equal(empty.scheduledBlocks.length,0);assert.deepEqual(empty.unplaced,[{taskId:'a',remainingMinutes:120}]);
});
test('같은 결과 재적용은 멱등, 다른 결과와 오래된 데이터는 409',()=>{
 const db=prepared(),body=plan(db),first=acceptAiPlan(db,body,{now});
 const saved={...db,scheduledBlocks:first.scheduledBlocks,aiScheduling:first.aiScheduling};
 assert.deepEqual(acceptAiPlan(saved,body,{now}).changes,[]);
 rejected(saved,[],409);
 const changed=structuredClone(db);changed.tasks[0].progress=0.5;rejected(changed,[block()],409);
 const settingsChanged=structuredClone(db);settingsChanged.user.settings.breakMinutes=20;rejected(settingsChanged,[block()],409);
 assert.throws(()=>acceptAiPlan(db,{contextId:'unknown',blocks:[]},{now}),e=>e.status===409);
});
test('겹침·휴식 부족·현재 이전·마감·운영 시간·ID·작업량 위반 거부',()=>{
 const db=prepared();
 for(const blocks of [[block({start:'12:00',end:'13:00'})],[block(),block({subtaskId:'s2',start:'09:30',end:'10:30'})],
  [block(),block({subtaskId:'s2',start:'10:05',end:'11:05'})],[block({start:'08:00',end:'09:00'})],[block({date:'2026-11-02'})],
  [block({date:'2026-02-30'})],[block({taskId:'unknown'})],[block({subtaskId:'unknown'})],
  [block({id:'duplicate'}),block({id:'duplicate',subtaskId:'s2',start:'10:10',end:'11:10'})],
  [block({end:'10:30'})],[block({status:'done'})],[block({start:'18:00',end:'19:00'})]]) rejected(db,blocks);
 rejected(db,[block()],400,new Date('2026-10-30T09:00:30+09:00'));
});
test('하위작업 순서를 지키고 선행 작업 미배치 상태의 후속 배치 거부',()=>{
 const db=prepared();rejected(db,[block({subtaskId:'s2'})]);
 rejected(db,[block({start:'10:10',end:'11:10'}),block({subtaskId:'s2',start:'09:00',end:'10:00'})]);
});
test('하루 한도와 여유 시간, 이미 시작된 보존 블록 보호',()=>{
 const value=data();value.user.settings.maxDailyMinutes=60;const db=prepared(value);rejected(db,plan(db).blocks);
 const tight=data();tight.user.settings.dayEnd='12:00';rejected(prepared(tight),plan(db).blocks);
 const started=data();started.scheduledBlocks=[{id:'future',...block({start:'09:00',end:'10:00'}),status:'planned'}];
 rejected(prepared(started),[],409,new Date('2026-10-30T09:01:00+09:00'));
});
test('복습 시작 가능 날짜와 마감 제한을 검증',()=>{
 const value=data();value.tasks[0].notBefore='2026-10-31T00:00:00+09:00';const db=prepared(value);rejected(db,[block()]);
 assert.equal(acceptAiPlan(db,plan(db,[block({date:'2026-10-31'})]),{now}).unplaced[0].remainingMinutes,60);
});


test('계획 범위 밖의 기존 미래 블록은 AI가 교체하지 않고 보존',()=>{
 const value=data();value.tasks[0].deadline='2026-12-01T18:00:00+09:00';
 value.scheduledBlocks=[{id:'far',...block({date:'2026-11-20'}),status:'planned'}];
 const db=prepared(value),context=db.aiScheduling.context;
 assert.ok(context.protectedBlocks.some(b=>b.id==='far'));
 assert.ok(!context.replaceableBlockIds.includes('far'));
 const result=acceptAiPlan(db,plan(db,[]),{now});
 assert.ok(result.scheduledBlocks.some(b=>b.id==='far'));
});


test('구조화된 AI 응답에서 하위작업 없는 작업의 null ID를 허용',()=>{
 const value=data();value.tasks[0].subtasks=[];const db=prepared(value);
 const result=acceptAiPlan(db,plan(db,[block({subtaskId:null})]),{now});
 assert.equal(result.scheduledBlocks.length,1);
 assert.ok(!Object.hasOwn(result.scheduledBlocks[0],'subtaskId'));
});


test('최대 블록 길이와 보존 기록의 휴식 간격을 독립적으로 검사',()=>{
 const value=data();value.tasks[0].subtasks=[];value.tasks[0].estimatedMinutes=240;
 const db=prepared(value);rejected(db,[block({subtaskId:undefined,end:'11:00'})]);
 const locked=data();locked.scheduledBlocks=[{id:'done',...block({start:'08:00',end:'09:00'}),status:'done'}];
 rejected(prepared(locked),[block()]);
});

test('최소 단위는 권장값이므로 AI의 짧은 부분 배치도 검증 후 수락',()=>{
 const db=prepared();const result=acceptAiPlan(db,plan(db,[block({end:'09:15'})]),{now});
 assert.equal(result.unplaced[0].remainingMinutes,105);
 assert.equal(result.scheduledBlocks[0].end,'09:15');
});
