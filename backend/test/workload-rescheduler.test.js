import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
import { reschedule, detectMissedBlocks } from '../src/scheduler/rescheduler.js';
const settings = { dayStart:'09:00', dayEnd:'18:00', minSlotMinutes:30, maxBlockMinutes:90, breakMinutes:10 };
const task = (extra={}) => ({ id:'a', title:'task', type:'coding', estimatedMinutes:180, progress:0, status:'todo', deadline:'2026-11-01T18:00:00+09:00', createdAt:'2026-10-20T09:00:00+09:00', ...extra });
const sub = (id, estimatedMinutes, done=false) => ({id,title:id,estimatedMinutes,done});
const block = (extra={}) => ({id:'old',taskId:'a',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned',...extra});
const min = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const total = blocks => blocks.reduce((n,b)=>n+min(b.end)-min(b.start),0);
const opts = (extra={}) => ({from:'2026-10-30',to:'2026-11-01',settings,...extra});
const db = (tasks,scheduledBlocks=[],update={}) => ({user:{settings:{...settings,...update}},tasks,fixedBlocks:[],scheduledBlocks});

test('진행 중 예약은 현재 이후 분만 차감, 경과 시간으로 완료 추정하지 않음',()=>{
 const t=task({estimatedMinutes:120});
 const now=new Date('2026-10-30T09:30:30+09:00');
 const result=reschedule(db([t],[block()]),{now,reason:'progress'});
 assert.deepEqual(result.scheduledBlocks.find(b=>b.id==='old'),block());
 assert.equal(total(result.scheduledBlocks.filter(b=>b.id!=='old')),91);
 const reported=reschedule(db([{...t,progress:0.25}],[block()]),{now,reason:'progress'});
 assert.equal(total(reported.scheduledBlocks.filter(b=>b.id!=='old')),61);
});
test('완료 하위작업은 미수행 감지 제외',()=>{
 assert.deepEqual(detectMissedBlocks([block({subtaskId:'s1'})],[task({subtasks:[sub('s1',90,true),sub('s2',90)]})],new Date('2026-10-30T12:00:00+09:00')),[]);
});
test('분산 재배치와 하위작업 순서, 재실행 안정성',()=>{
 const data=db([task({subtasks:[sub('s1',90),sub('s2',90)]})],[],{distribution:'balanced'});
 const options={now:new Date('2026-10-30T09:00:00+09:00'),reason:'manual'};
 const result=reschedule(data,options);
 const order=result.scheduledBlocks.map(b=>b.subtaskId);
 assert.ok(order.lastIndexOf('s1')<order.indexOf('s2'));
 assert.deepEqual(reschedule({...data,scheduledBlocks:result.scheduledBlocks},options).changes,[]);
});
