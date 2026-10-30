import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createJsonStore} from '../src/store/index.js';import {createVoiceService} from '../src/services/voice-command-service.js';
import {createAiPlanner} from '../src/services/ai-planner.js';import {reschedule} from '../src/scheduler/rescheduler.js';
import {acceptAiPlan} from '../src/scheduler/ai-plan.js';import {updateAvailability} from '../src/services/scheduling-constraints.js';
import {schedulingRevision} from '../src/scheduler/planning-context.js';
const now=new Date('2026-10-30T15:00:00+09:00');
function fixture(){return{user:{settings:{dayStart:'08:00',dayEnd:'20:00',minSlotMinutes:30,maxBlockMinutes:60,breakMinutes:10,maxDailyMinutes:240,bufferMinutes:30,travelMinutes:0}},tasks:[{id:'t',title:'보고서',type:'report',deadline:'2026-11-02T18:00:00+09:00',estimatedMinutes:60,progress:0,status:'todo'},{id:'d',title:'완료 작업',type:'reading',deadline:'2026-10-29T18:00:00+09:00',estimatedMinutes:30,progress:1,status:'done'}],fixedBlocks:[{id:'routine',title:'운동',kind:'routine',dayOfWeek:[6],start:'08:00',end:'08:30',travelMinutes:0}],scheduledBlocks:[{id:'done',taskId:'d',date:'2026-10-29',start:'10:00',end:'10:30',status:'done'},{id:'saturday',taskId:'t',date:'2026-10-31',start:'08:30',end:'09:30',status:'planned'}],history:[],voiceCommands:[],schedulerRequests:[]};}
const extracted=(dates=['2026-10-31'],action='block')=>({intent:'reschedule',slots:{title:null,type:null,deadline:null,baseEstimatedMinutes:null,importance:null,taskId:null,progress:null,actualMinutes:null,actualMinutesMode:null,date:null,unavailableDates:dates,availabilityAction:action},reply:'토요일은 편히 쉬실 수 있도록 조정할게요.',assumptions:[]});

test('토요일 휴무 채팅 → AI 전달 → 일요일로 이동·따뜻한 답변·기록 보존·중복 요청',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'jday-dayoff-'));t.after(()=>rm(dir,{recursive:true,force:true}));const seedPath=path.join(dir,'seed.json');const initial=fixture();await writeFile(seedPath,JSON.stringify(initial));const store=createJsonStore({seedPath,dbPath:path.join(dir,'db.json')});
 let action='block',calls=0;
 const planner=createAiPlanner({clock:()=>now,completeFn:async request=>{
  calls++;const context=JSON.parse(request.messages[0].content);
  if(action==='block'){assert.deepEqual(context.unavailableDates,['2026-10-31']);assert.deepEqual(context.days.find(d=>d.date==='2026-10-31').slots,[]);}
  return JSON.stringify({contextId:context.contextId,blocks:[{taskId:'t',subtaskId:null,date:action==='block'?'2026-11-01':'2026-10-31',start:'08:30',end:'09:30',placementReason:'휴무를 피한 배치'}]});
 }});
 const service=createVoiceService({...store,interpreter:async()=>extracted(['2026-10-31'],action),scheduler:planner,now:()=>now});
 const request={requestId:'dayoff',text:'나 토요일 쉬고 싶은데 토요일 일정 빼줘'};
 const result=await service.interpret(request);assert.equal(result.status,'scheduled');assert.match(result.reply,/편안한 주말/);assert.match(result.reply,/고정 일정은 그대로/);
 const db=await store.readDb();assert.deepEqual(db.schedulingConstraints.unavailableDates,['2026-10-31']);assert.ok(!db.scheduledBlocks.some(b=>b.date==='2026-10-31'&&b.status==='planned'));assert.deepEqual(db.fixedBlocks,initial.fixedBlocks);assert.ok(db.scheduledBlocks.some(b=>b.id==='done'));assert.equal(db.schedulerRequests[0].status,'processed');
 assert.equal((await service.interpret(request)).replayed,true);assert.equal(calls,1);
 action='unblock';await service.interpret({requestId:'allow-sat',text:'토요일 휴무 취소하고 다시 작업 넣어줘'});assert.deepEqual((await store.readDb()).schedulingConstraints.unavailableDates,[]);
});

test('휴무 날짜의 배치는 서버에서 거부하고 다른 요청에서도 날짜 제약 유지',()=>{
 const db=fixture();updateAvailability(db,{unavailableDates:['2026-10-31'],availabilityAction:'block'},now);const revision=schedulingRevision(db);const prepared=reschedule(db,{now,reason:'new_task'});db.scheduledBlocks=prepared.scheduledBlocks;db.aiScheduling={status:'pending',context:prepared.planningContext};
 assert.throws(()=>acceptAiPlan(db,{contextId:prepared.planningContext.contextId,blocks:[{taskId:'t',subtaskId:null,date:'2026-10-31',start:'09:00',end:'10:00'}]},{now}),/쉬기로 한 날짜/);
 updateAvailability(db,{unavailableDates:['2026-10-31'],availabilityAction:'unblock'},now);assert.notEqual(schedulingRevision(db),revision);
});

test('마감 전 이동이 불가능하면 미배치로 남기고 성공을 과장하지 않음',async()=>{
 let db=fixture();const planner=createAiPlanner({clock:()=>now,completeFn:async request=>JSON.stringify({contextId:JSON.parse(request.messages[0].content).contextId,blocks:[]})});
 const service=createVoiceService({readDb:async()=>structuredClone(db),updateDb:async updater=>{const candidate=structuredClone(db);db=(await updater(candidate))??candidate;},interpreter:async()=>extracted(),scheduler:planner,now:()=>now});
 const result=await service.interpret({requestId:'unplaced',text:'토요일은 쉬고 싶어'});assert.match(result.reply,/모두 옮기지 못한 작업/);assert.equal(result.result.unplaced[0].remainingMinutes,60);
});

test('실패 시 휴무 설정도 부분 저장하지 않음, 잘못된 날짜는 거부',async()=>{
 let db=fixture();const before=structuredClone(db);const service=createVoiceService({readDb:async()=>structuredClone(db),updateDb:async updater=>{const candidate=structuredClone(db);db=(await updater(candidate))??candidate;},interpreter:async()=>extracted(),scheduler:async()=>{throw new Error('AI failure');},now:()=>now});
 await assert.rejects(service.interpret({requestId:'failure',text:'토요일 쉬고 싶어'}),/AI failure/);assert.deepEqual(db,before);
 assert.throws(()=>updateAvailability(db,{unavailableDates:['2026-02-30'],availabilityAction:'block'},now));assert.throws(()=>updateAvailability(db,{unavailableDates:['2026-10-29'],availabilityAction:'block'},now));
});


test('기본 14일 밖의 휴무 날짜도 최대 31일 범위에서 교체 대상으로 포함',()=>{
 const db=fixture();db.scheduledBlocks.push({id:'far',taskId:'t',date:'2026-11-20',start:'09:00',end:'10:00',status:'planned'});
 updateAvailability(db,{unavailableDates:['2026-11-20'],availabilityAction:'block'},now);
 const result=reschedule(db,{now,reason:'manual'});assert.equal(result.planningContext.window.to,'2026-11-20');assert.ok(result.planningContext.replaceableBlockIds.includes('far'));assert.deepEqual(result.planningContext.days.find(d=>d.date==='2026-11-20').slots,[]);
});
