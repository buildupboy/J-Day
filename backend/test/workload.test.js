import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
const settings = { dayStart:'09:00', dayEnd:'18:00', minSlotMinutes:30, maxBlockMinutes:90, breakMinutes:10 };
const task = (extra={}) => ({ id:'a', title:'task', type:'coding', estimatedMinutes:180, progress:0, status:'todo', deadline:'2026-11-01T18:00:00+09:00', createdAt:'2026-10-20T09:00:00+09:00', ...extra });
const sub = (id, estimatedMinutes, done=false) => ({id,title:id,estimatedMinutes,done});
const block = (extra={}) => ({id:'old',taskId:'a',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned',...extra});
const min = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const total = blocks => blocks.reduce((n,b)=>n+min(b.end)-min(b.start),0);
const opts = (extra={}) => ({from:'2026-10-30',to:'2026-11-01',settings,...extra});
const db = (tasks,scheduledBlocks=[],update={}) => ({user:{settings:{...settings,...update}},tasks,fixedBlocks:[],scheduledBlocks});

test('완료 하위작업 제외, 진행률 중복 차감 방지, subtaskId 순서',()=>{
 const t=task({estimatedMinutes:270,progress:0.2,subtasks:[sub('done',60,true),sub('erd',120),sub('report',90)]});
 const result=allocate([t],[],opts());
 assert.equal(total(result.blocks),210);
 assert.deepEqual(result.blocks.map(b=>b.subtaskId),['erd','erd','report']);
 assert.equal(total(allocate([task({estimatedMinutes:200,progress:0.75,subtasks:[sub('s1',100,true),sub('s2',100)]})],[],opts()).blocks),50);
});
test('보정된 총시간을 하위작업 비중으로 분배하고 합계 유지',()=>{
 const result=allocate([task({estimatedMinutes:101,subtasks:[sub('s1',30),sub('s2',30),sub('s3',30)]})],[],opts());
 assert.deepEqual(['s1','s2','s3'].map(id=>total(result.blocks.filter(b=>b.subtaskId===id))),[34,34,33]);
});
test('하위작업 예약량 차감 및 선행 작업의 미래 예약 시간 준수',()=>{
 const t=task({estimatedMinutes:120,subtasks:[sub('s1',60),sub('s2',60)]});
 const existing=[block({subtaskId:'s1',date:'2026-10-31'})];
 const result=allocate([t],[],opts({existingBlocks:existing}));
 assert.equal(total(result.blocks),60);
 assert.equal(result.blocks[0].subtaskId,'s2');
 assert.equal(result.blocks[0].date,'2026-10-31');
 assert.equal(result.blocks[0].start,'10:10');
 assert.deepEqual(allocate([t],[],opts({existingBlocks:[...existing,...result.blocks]})).blocks,[]);
});
test('하위작업 완료 및 잘못된 입력',()=>{
 assert.equal(allocate([task({subtasks:[sub('done',180,true)]})],[],opts()).blocks.length,0);
 for(const subtasks of [[sub('s',90),sub('s',90)],[sub('zero',0)],[sub('bad',-1)]]) assert.throws(()=>allocate([task({subtasks})],[],opts()),RangeError);
});
test('균등 분산은 가능한 날짜로 나누고 부족량이 늘면 이른 배치로 복구',()=>{
 const options=opts({settings:{...settings,distribution:'balanced'}});
 const result=allocate([task()],[],options);
 assert.deepEqual(['2026-10-30','2026-10-31','2026-11-01'].map(date=>total(result.blocks.filter(b=>b.date===date))),[60,60,60]);
 const crowded=allocate([task({estimatedMinutes:300})],[{dayOfWeek:[6,0],start:'09:30',end:'18:00'}],options);
 assert.equal(total(crowded.blocks),300);
 assert.deepEqual(crowded.unplaced,[]);
});
test('다양한 작업량에서 총시간 보존, 충돌·하루 한도·순서 확인',()=>{
 for(let size=30;size<=330;size+=30){
  const t=task({estimatedMinutes:size,subtasks:[sub('s1',1),sub('s2',2),sub('s3',3)]});
  const result=allocate([t],[],opts({settings:{...settings,distribution:'balanced',maxDailyMinutes:120,bufferMinutes:30}}));
  assert.equal(total(result.blocks)+result.unplaced.reduce((n,e)=>n+e.remainingMinutes,0),size);
  assert.ok(result.blocks.every(b=>min(b.end)<=17*60+30));
  for(let i=1;i<result.blocks.length;i++){
   const a=result.blocks[i-1],b=result.blocks[i];
   if(a.date===b.date) assert.ok(min(b.start)-min(a.end)>=10);
   assert.ok(Number(b.subtaskId.slice(1))>=Number(a.subtaskId.slice(1)));
  }
  for(const date of new Set(result.blocks.map(b=>b.date))) assert.ok(total(result.blocks.filter(b=>b.date===date))<=120);
 }
});
