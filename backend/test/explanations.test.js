import test from 'node:test';
import assert from 'node:assert/strict';
import { explainSchedule } from '../src/scheduler/explanations.js';
test('AI 이유와 기존 기록을 구분하여 설명',()=>{
 const tasks=[{id:'a',title:'과제',importance:2,deadline:'2026-11-01T12:00:00+09:00'}];
 const common={taskId:'a',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned'};
 const result=explainSchedule(tasks,{schedulingStatus:'applied',scheduledBlocks:[{...common,id:'ai',source:'ai',placementReason:'오전 선호'},{...common,id:'old'}]});
 assert.equal(result.blocks[0].reasons[0],'오전 선호');
 assert.match(result.blocks[1].reasons[0],/보존/);
 assert.ok(!JSON.stringify(result).includes('짧은 순으로 우선순위'));
});
