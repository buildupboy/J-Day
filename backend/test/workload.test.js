import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingWork } from '../src/scheduler/workload.js';
const sub=(id,estimatedMinutes,done=false)=>({id,title:id,estimatedMinutes,done});
const task=(extra={})=>({id:'a',estimatedMinutes:270,progress:0.2,status:'todo',...extra});
test('하위작업 완료와 전체 진행률은 중복 차감하지 않음',()=>{
 const result=remainingWork(task({subtasks:[sub('done',60,true),sub('erd',120),sub('report',90)]}));
 assert.deepEqual(result.map(s=>s.remaining),[0,120,90]);
});
test('보정된 전체 시간을 비중으로 나누고 합계를 보존',()=>{
 const result=remainingWork(task({estimatedMinutes:101,progress:0,subtasks:[sub('s1',30),sub('s2',30),sub('s3',30)]}));
 assert.deepEqual(result.map(s=>s.remaining),[34,34,33]);
});
test('잘못된 하위작업은 거부, 완료 작업은 남은 작업량 0',()=>{
 assert.ok(remainingWork(task({status:'done',subtasks:[sub('s',270)]})).every(s=>s.remaining===0));
 assert.throws(()=>remainingWork(task({subtasks:[sub('s',30),sub('s',30)]})),RangeError);
 assert.throws(()=>remainingWork(task({subtasks:[sub('s',0)]})),RangeError);
});
