import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../src/scheduler/allocator.js';
import { reschedule } from '../src/scheduler/rescheduler.js';
const settings = {dayStart:'09:00', dayEnd:'12:00', minSlotMinutes:30, maxBlockMinutes:60, breakMinutes:10};
const task = (id, estimatedMinutes=180, extra={}) => ({id,estimatedMinutes,progress:0,status:'todo',deadline:'2026-11-01T12:00:00+09:00',...extra});
const min = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const total = blocks => blocks.reduce((n,b)=>n+min(b.end)-min(b.start),0);
function run(tasks, update={}, existingBlocks=[], fixedBlocks=[]) {
 return allocate(tasks,fixedBlocks,{from:'2026-10-30',to:'2026-11-01',settings:{...settings,...update},existingBlocks});
}
test('하루 한도로 여러 날 분산하고 기존 동작은 유지',()=>{
 const result=run([task('a')],{maxDailyMinutes:60});
 assert.deepEqual(result.blocks.map(b=>b.date),['2026-10-30','2026-10-31','2026-11-01']);
 assert.equal(total(result.blocks),180);
 assert.deepEqual(result.unplaced,[]);
 assert.deepEqual(run([task('a')]),run([task('a')],{maxDailyMinutes:1440,bufferMinutes:0}));
});
test('한도는 모든 과제에 공유되고 부족량은 반환',()=>{
 const result=run([task('a',120),task('b',120)],{maxDailyMinutes:60});
 for(const date of ['2026-10-30','2026-10-31','2026-11-01']) assert.equal(total(result.blocks.filter(b=>b.date===date)),60);
 assert.equal(total(result.blocks),180);
 assert.deepEqual(result.unplaced,[{taskId:'b',remainingMinutes:60}]);
});
test('오늘 완료한 작업도 한도에 반영, missed는 제외',()=>{
 const existing=[{id:'old',taskId:'other',date:'2026-10-30',start:'09:00',end:'10:00',status:'done'}];
 const result=run([task('a',120)],{maxDailyMinutes:60},existing);
 assert.equal(result.blocks[0].date,'2026-10-31');
 assert.equal(run([task('a',60)],{maxDailyMinutes:60},[{...existing[0],status:'missed'}]).blocks[0].date,'2026-10-30');
});
test('여유 시간은 늦은 빈 구간에서 확보하고 휴식과 별개',()=>{
 const result=run([task('a',300)],{bufferMinutes:60});
 assert.equal(total(result.blocks.filter(b=>b.date==='2026-10-30')),110);
 assert.equal(result.blocks.filter(b=>b.date==='2026-10-30').at(-1).end,'11:00');
 assert.equal(total(result.blocks),300);
});
test('여유 시간은 여러 빈 구간에 걸쳐 확보 가능',()=>{
 const fixed=[{dayOfWeek:[5,6,0],start:'10:00',end:'11:30'}];
 const result=run([task('a',90)],{bufferMinutes:60},[],fixed);
 assert.equal(result.blocks.length,3);
 assert.ok(result.blocks.every(b=>b.start==='09:00' && b.end==='09:30'));
});
test('시간 부족, 0 한도, 지나친 설정 및 짧은 잔여 한도',()=>{
 assert.equal(run([task('a')],{bufferMinutes:180}).blocks.length,0);
 assert.equal(run([task('a')],{maxDailyMinutes:0}).blocks.length,0);
 const result=run([task('a',50)],{maxDailyMinutes:25});
 assert.equal(result.blocks.length,2);
 assert.equal(total(result.blocks),50);
 for(const update of [{maxDailyMinutes:-1},{bufferMinutes:1441},{maxDailyMinutes:1.5},{bufferMinutes:null}]) assert.throws(()=>run([task('a')],update),RangeError);
});
test('마감이 빠른 과제를 우선하며 한도 때문에 마감을 넘기지 않음',()=>{
 const result=run([task('late',60),task('urgent',90,{deadline:'2026-10-30T12:00:00+09:00'})],{maxDailyMinutes:60});
 assert.equal(result.blocks[0].taskId,'urgent');
 assert.deepEqual(result.unplaced,[{taskId:'urgent',remainingMinutes:30}]);
});
test('재배치에서 완료량 반영, 다음 날 한도 복원, 반복 실행 안정성',()=>{
 const db={user:{settings:{...settings,maxDailyMinutes:90,bufferMinutes:30}},tasks:[task('a',120)],fixedBlocks:[],scheduledBlocks:[{id:'done',taskId:'other',date:'2026-10-30',start:'09:00',end:'10:00',status:'done'}]};
 const original=structuredClone(db);
 const opts={now:new Date('2026-10-30T10:00:00+09:00'),reason:'manual'};
 const result=reschedule(db,opts);
 assert.equal(total(result.scheduledBlocks.filter(b=>b.date==='2026-10-30'&&b.status==='planned')),30);
 assert.equal(total(result.scheduledBlocks.filter(b=>b.date==='2026-10-31')),90);
 const repeat=reschedule({...db,scheduledBlocks:result.scheduledBlocks},opts);
 assert.deepEqual(repeat.scheduledBlocks,result.scheduledBlocks);
 assert.deepEqual(repeat.changes,[]);
 assert.deepEqual(db,original);
});
