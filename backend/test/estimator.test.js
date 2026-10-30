import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCorrectionFactors, applyCorrection } from '../src/scheduler/estimator.js';
const settings = { dayStart:'09:00', dayEnd:'18:00', minSlotMinutes:30, maxBlockMinutes:90, breakMinutes:10 };
const task = (extra={}) => ({ id:'a', title:'task', type:'coding', estimatedMinutes:180, progress:0, status:'todo', deadline:'2026-11-01T18:00:00+09:00', createdAt:'2026-10-20T09:00:00+09:00', ...extra });
const sub = (id, estimatedMinutes, done=false) => ({id,title:id,estimatedMinutes,done});
const block = (extra={}) => ({id:'old',taskId:'a',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned',...extra});
const min = t => Number(t.slice(0,2))*60+Number(t.slice(3));
const total = blocks => blocks.reduce((n,b)=>n+min(b.end)-min(b.start),0);
const opts = (extra={}) => ({from:'2026-10-30',to:'2026-11-01',settings,...extra});
const db = (tasks,scheduledBlocks=[],update={}) => ({user:{settings:{...settings,...update}},tasks,fixedBlocks:[],scheduledBlocks});

test('유형별 합계 보정, 잘못된 기록 제외, 기록 없으면 1배',()=>{
 const factors=computeCorrectionFactors([{type:'coding',estimatedMinutes:100,actualMinutes:200},{type:'coding',estimatedMinutes:300,actualMinutes:300},{type:'coding',estimatedMinutes:0,actualMinutes:100},null]);
 assert.deepEqual(factors,{coding:1.25});
 assert.equal(applyCorrection(61,'coding',factors),80);
 assert.equal(applyCorrection(61,'exam',factors),61);
 assert.equal(applyCorrection(0,'coding',factors),0);
 assert.deepEqual(computeCorrectionFactors([]),{});
 assert.throws(()=>applyCorrection(60,'coding',{coding:0}),RangeError);
});
