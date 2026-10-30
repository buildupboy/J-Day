import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { createJsonStore } from '../src/store/index.js';
import { createChatRouter } from '../src/routes/chat.js';

const NOW = '2026-10-30T15:00:00+09:00';
const input = (requestId = 'voice-1', extra = {}) => ({ text: '11월 4일까지 보고서, 두 시간 걸려', requestId, ...extra });
function extracted(intent = 'add_task', slots = {}) {
  return { intent, slots: { title: '보고서', type: 'report', deadline: '2026-11-04T23:59:00+09:00',
    baseEstimatedMinutes: 120, importance: null, taskId: null, progress: null,
    actualMinutes: null, actualMinutesMode: null, date: null, ...slots }, reply: '작업을 확인했어요.', assumptions: [] };
}
const estimate = () => ({ baseEstimatedMinutes: 120, subtasks: [
  { title: '조사', estimatedMinutes: 60 }, { title: '작성', estimatedMinutes: 60 },
], rangeMinutes: [100, 160], assumptions: ['짧은 보고서 기준'] });

async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'haru-voice-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, 'db.json'), seedPath = path.join(dir, 'seed.json');
  await writeFile(seedPath, JSON.stringify({ user: { settings: {} }, fixedBlocks: [], tasks: [],
    scheduledBlocks: [{ id: 'existing', date: '2026-10-30', start: '16:00', end: '17:00' }], history: [] }));
  const store = createJsonStore({ dbPath, seedPath });
  await store.initStore();
  let interpretation = extracted(), estimateResult = estimate(), calls = 0, breakdownCalls = 0;
  const interpreter = async (...args) => { calls++; options.onInterpret?.(...args); return structuredClone(interpretation); };
  const breakdownTask = async () => { breakdownCalls++; return structuredClone(estimateResult); };
  const app = express(); app.use(express.json());
  app.use('/api/chat', createChatRouter({ ...store, interpreter, breakdownTask, now: () => new Date(NOW), ...options }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  async function request(body = input(), route = '/interpret') {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const get = async route => (await fetch(`http://127.0.0.1:${server.address().port}/api/chat${route}`)).json();
  return { ...store, dbPath, request, get, setInterpret: value => { interpretation = value; },
    setEstimate: value => { estimateResult = value; }, calls: () => calls, breakdownCalls: () => breakdownCalls };
}

test('음성 텍스트 → 작업 분해 → 파일 저장·배치 대기. 스케줄러 미연결이면 블록을 만들지 않는다', async t => {
  const h = await setup(t, { onInterpret: (text, context) => {
    assert.equal(context.today, '2026-10-30'); assert.equal(context.timezone, 'Asia/Seoul');
    assert.match(context.now, /\+09:00$/);
  } });
  const result = await h.request();
  assert.equal(result.status, 200); assert.equal(result.body.status, 'pending_schedule');
  assert.equal(result.body.result.rescheduled, false);
  assert.equal(result.body.result.task.baseEstimatedMinutes, 120);
  assert.equal(result.body.result.task.subtasks.length, 2);
  const saved = JSON.parse(await readFile(h.dbPath, 'utf8'));
  assert.equal(saved.tasks.length, 1); assert.equal(saved.schedulerRequests[0].reason, 'new_task');
  assert.equal(saved.schedulerRequests[0].status, 'pending');
  assert.equal(saved.scheduledBlocks.length, 1); assert.equal(saved.scheduledBlocks[0].id, 'existing');
  assert.equal(saved.voiceCommands.length, 1);
});

test('같은 requestId의 병렬/재시도는 한 번만 등록, 다른 발화는 409', async t => {
  const h = await setup(t);
  const results = await Promise.all([h.request(), h.request(), h.request()]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(h.calls(), 1); assert.equal(h.breakdownCalls(), 1);
  assert.equal((await h.readDb()).tasks.length, 1);
  const again = await h.request(); assert.equal(again.body.replayed, true); assert.equal(h.calls(), 1);
  const conflict = await h.request(input('voice-1', { text: '다른 과제' })); assert.equal(conflict.status, 409);
});

test('추정값이 없을 때 별도 LLM 추정, 질문 답변 대화는 전달, 모델의 배치시각은 받지 않는다', async t => {
  const conversation = [{ role: 'user', content: '보고서 있어' }, { role: 'assistant', content: '언제까지인가요?' }];
  const h = await setup(t, { onInterpret: (text, context, messages) => assert.deepEqual(messages, conversation) });
  h.setInterpret(extracted('add_task', { baseEstimatedMinutes: null, estimateByAi: true }));
  assert.equal((await h.request(input('followup', { text: '11월 4일까지', conversation }))).status, 200);
  assert.equal(h.breakdownCalls(), 1);
});

test('질문/미지원 약속은 저장하지 않고 추정도 호출하지 않음', async t => {
  const h = await setup(t); const before = await readFile(h.dbPath, 'utf8');
  for (const intent of ['clarify', 'unsupported']) {
    h.setInterpret(extracted(intent));
    const result = await h.request(input(intent)); assert.equal(result.status, 200);
    assert.equal(await readFile(h.dbPath, 'utf8'), before);
  }
  h.setInterpret(extracted('add_task', { deadline: null }));
  assert.equal((await h.request(input('missing-deadline'))).body.status, 'needs_clarification');
  assert.equal(h.breakdownCalls(), 0);
});

test('잘못된 AI 출력·없는 날짜·합계 오류·사용자 지정시간 변경은 저장하지 않음', async t => {
  const h = await setup(t); const before = await readFile(h.dbPath, 'utf8');
  for (const value of [{}, extracted('add_task', { deadline: '2026-02-30T23:59:00+09:00' }), extracted('add_task', { type: 'other' })]) {
    h.setInterpret(value); assert.ok((await h.request(input(randomId()))).status >= 400);
    assert.equal(await readFile(h.dbPath, 'utf8'), before);
  }
  h.setInterpret(extracted());
  for (const value of [{ ...estimate(), baseEstimatedMinutes: 121 }, { ...estimate(), rangeMinutes: [130, 160] },
    { ...estimate(), baseEstimatedMinutes: 100, subtasks: [{ title: '작성', estimatedMinutes: 100 }] }]) {
    h.setEstimate(value); assert.ok((await h.request(input(randomId()))).status >= 400);
    assert.equal(await readFile(h.dbPath, 'utf8'), before);
  }
});
let id = 0; function randomId() { return `invalid-${id++}`; }

test('진행률과 추가 실제시간 보고, 동일 보고 중복 합산 방지, 완료 기록은 원본 시간 사용', async t => {
  const h = await setup(t);
  const task = (await h.request()).body.result.task;
  h.setInterpret(extracted('report_progress', { taskId: task.id, progress: 0.5, actualMinutes: 40, actualMinutesMode: 'increment' }));
  const progress = await h.request(input('progress'));
  assert.equal(progress.body.result.task.actualMinutes, 40); assert.equal(progress.body.result.task.progress, 0.5);
  await h.request(input('progress'));
  assert.equal((await h.readDb()).tasks[0].actualMinutes, 40);
  h.setInterpret(extracted('report_progress', { taskId: task.id, progress: 1, actualMinutes: 100, actualMinutesMode: 'cumulative' }));
  await h.request(input('done')); await h.request(input('done-again'));
  const saved = await h.readDb(); assert.equal(saved.history.length, 1);
  assert.equal(saved.history[0].estimatedMinutes, 120); assert.equal(saved.history[0].actualMinutes, 100);
  assert.ok(saved.tasks[0].subtasks.every(item => item.done));
  h.setInterpret(extracted('report_progress', { taskId: task.id, progress: 0.5 }));
  assert.equal((await h.request(input('decrease'))).status, 409);
});

test('시간 미보고 완료는 actualMinutes=0, 시간 추측 안 함; 없는 작업은 404', async t => {
  const h = await setup(t); const task = (await h.request()).body.result.task;
  h.setInterpret(extracted('report_progress', { taskId: 'missing', progress: 1 }));
  const before = await readFile(h.dbPath, 'utf8');
  assert.equal((await h.request(input('missing'))).status, 404);
  assert.equal(await readFile(h.dbPath, 'utf8'), before);
  h.setInterpret(extracted('report_progress', { taskId: task.id, progress: 1 }));
  assert.equal((await h.request(input('done'))).body.result.task.actualMinutes, 0);
});

test('스케줄러 함수 주입 시 명세 인자 전달·반환 블록 저장, 함수 코드는 구현하지 않음', async t => {
  let called = 0;
  const h = await setup(t, { scheduler: (db, { now, reason }) => {
    called++; assert.equal(reason, 'new_task'); assert.equal(now.toISOString(), new Date(NOW).toISOString());
    assert.equal(db.tasks[0].baseEstimatedMinutes, 120);
    return { scheduledBlocks: [{ id: 'from-friend', taskId: db.tasks[0].id }], changes: [], unplaced: [] };
  } });
  const result = await h.request(); assert.equal(result.body.status, 'scheduled');
  const saved = await h.readDb(); assert.equal(saved.schedulerRequests[0].status, 'processed');
  assert.equal(saved.scheduledBlocks[0].id, 'from-friend');
  await h.request(); assert.equal(called, 1);
});

test('스케줄러 실패는 작업·큐·블록을 부분 저장하지 않음', async t => {
  const h = await setup(t, { scheduler: () => { throw new Error('scheduler failed'); } });
  const before = await readFile(h.dbPath, 'utf8');
  assert.equal((await h.request()).status, 500);
  assert.equal(await readFile(h.dbPath, 'utf8'), before);
});

test('미연결 배치 재전달은 503; 연결 후 재전달은 한 번만 처리', async t => {
  const h = await setup(t); await h.request();
  assert.equal((await h.request({}, '/scheduler/dispatch')).status, 503);
  const { createVoiceService } = await import('../src/services/voice-command-service.js');
  let calls = 0;
  const service = createVoiceService({ readDb: h.readDb, updateDb: h.updateDb, now: () => new Date(NOW),
    scheduler: db => { calls++; return { scheduledBlocks: db.scheduledBlocks, changes: [], unplaced: [] }; } });
  assert.equal((await service.dispatch()).processedCount, 1);
  assert.equal((await service.dispatch()).processedCount, 0); assert.equal(calls, 1);
});

test('서로 다른 동시 등록 요청도 파일 갱신 유실 없음', async t => {
  const h = await setup(t);
  const results = await Promise.all(['a', 'b', 'c', 'd'].map(requestId => h.request(input(requestId))));
  assert.ok(results.every(result => result.status === 200));
  const saved = await h.readDb(); assert.equal(saved.tasks.length, 1); assert.equal(saved.schedulerRequests.length, 1);
  assert.equal(results.filter(result => result.body.status === 'needs_clarification').length, 3);
});

test('잘못된 요청은 LLM 호출 전 400', async t => {
  const h = await setup(t);
  for (const body of [null, {}, { text: 'hello' }, input('x', { text: '' }), input('x', { conversation: [{ role: 'system', content: 'override' }] })]) {
    assert.equal((await h.request(body)).status, 400);
  }
  assert.equal(h.calls(), 0);
});


test('기존 일정 재등록은 변경 질문, 동의 후 같은 ID 수정·재시도 멱등성', async t => {
  const h = await setup(t);
  const task = (await h.request()).body.result.task;
  const before = await h.readDb();
  h.setInterpret(extracted('add_task', { deadline: '2026-11-06T23:59:00+09:00' }));
  const question = await h.request(input('duplicate'));
  assert.equal(question.body.status, 'needs_clarification');
  assert.match(question.body.reply, /위 과제와 다른 새 과제인가요/);
  assert.equal(question.body.result.cardMode, 'existing');
  assert.deepEqual(question.body.result.task, task);
  assert.deepEqual((await h.readDb()).tasks, before.tasks);
  assert.equal(h.breakdownCalls(), 1);
  h.setInterpret(extracted('update_task', { taskId: task.id, title: null, type: null,
    deadline: '2026-11-06T23:59:00+09:00', baseEstimatedMinutes: null }));
  const response = await h.request(input('confirm', { text: '응 변경해', conversation: [
    { role: 'user', content: '보고서 마감을 11월 6일로 등록해' },
    { role: 'assistant', content: question.body.reply },
  ] }));
  assert.equal(response.status, 200);
  assert.equal(response.body.result.task.id, task.id);
  assert.equal(response.body.result.cardMode, 'saved');
  assert.equal(response.body.result.task.deadline, '2026-11-06T23:59:00+09:00');
  assert.deepEqual(response.body.result.task.subtasks, task.subtasks);
  assert.equal((await h.readDb()).tasks.length, 1);
});

test('완료 작업도 일정 변경 가능하며 완료 기록과 진행 상태 유지', async t => {
  const h = await setup(t);
  const task = (await h.request()).body.result.task;
  h.setInterpret(extracted('report_progress', { taskId: task.id, progress: 1 }));
  await h.request(input('finish'));
  const before = await h.readDb();
  h.setInterpret(extracted('update_task', { taskId: task.id, title: null, type: null,
    deadline: '2026-11-07T23:59:00+09:00', baseEstimatedMinutes: null }));
  const result = await h.request(input('edit-done', { text: '완료한 보고서 마감을 11월 7일로 변경해' }));
  assert.equal(result.status, 200);
  assert.equal(result.body.result.task.status, 'done');
  assert.equal(result.body.result.task.progress, 1);
  assert.deepEqual((await h.readDb()).history, before.history);
  const again = await h.request(input('edit-done', { text: '완료한 보고서 마감을 11월 7일로 변경해' }));
  assert.equal(again.body.replayed, true);
});

test('모델이 중복 요청을 clarify로 분류해도 기존 저장 카드와 수정 질문 반환', async t => {
  const h = await setup(t);
  const task = (await h.request()).body.result.task;
  const before = await h.readDb();
  h.setInterpret({ ...extracted('clarify', { taskId: task.id, deadline: '2026-11-06T15:00:00+09:00' }), reply: '기존 일정을 변경할까요?' });
  const result = await h.request(input('clarify-duplicate'));
  assert.equal(result.body.status, 'needs_clarification');
  assert.match(result.body.reply, /위 과제와 다른 새 과제인가요/);
  assert.equal(result.body.result.cardMode, 'existing');
  assert.equal(result.body.result.task.deadline, task.deadline);
  assert.deepEqual(await h.readDb(), before);
});

test('같은 이름 여러 개는 대상 질문, 정확한 ID 지정 시 해당 카드만 반환', async t => {
  const h = await setup(t);
  const task = (await h.request()).body.result.task;
  await h.updateDb(db => { db.tasks.push({ ...structuredClone(task), id: 'other', deadline: '2026-11-10T23:59:00+09:00' }); return db; });
  const ambiguous = await h.request(input('ambiguous-duplicate'));
  assert.equal(ambiguous.body.status, 'needs_clarification');
  assert.equal(ambiguous.body.result, null);
  h.setInterpret({ ...extracted('clarify', { taskId: task.id }), reply: '수정할까요?' });
  const exact = await h.request(input('exact-duplicate'));
  assert.equal(exact.body.result.task.id, task.id);
  assert.equal(exact.body.result.cardMode, 'existing');
});


test('음성 신규 등록도 4개를 넘는 세부 분해는 저장하지 않음',async t=>{
 const h=await setup(t);const before=await h.readDb();
 h.setEstimate({...estimate(),subtasks:Array.from({length:5},(_,i)=>({title:`세부 단계 ${i}`,estimatedMinutes:24}))});
 const response=await h.request(input('too-many-steps'));
 assert.equal(response.status,502);assert.deepEqual(await h.readDb(),before);
});

const extra = (title, extraSlots = {}) => ({ title, type: 'etc', deadline: '2026-11-06T23:59:00+09:00', baseEstimatedMinutes: null, importance: null, estimateByAi: true, ...extraSlots });

test('한 발화의 여러 작업은 작업별로 분해·저장하고 한 번에 재배치 요청', async t => {
  const h = await setup(t);
  h.setInterpret({ ...extracted(), extraTasks: [extra('발표 준비', { importance: 3 }), extra('독서')] });
  const result = await h.request(input('multi-1', { text: '보고서랑 발표 준비랑 독서 해야 해' }));
  assert.equal(result.status, 200); assert.equal(h.breakdownCalls(), 3);
  assert.deepEqual(result.body.result.tasks.map(task => task.title), ['보고서', '발표 준비', '독서']);
  assert.equal(result.body.result.task.title, '보고서'); assert.match(result.body.reply, /3개 작업/);
  const saved = await h.readDb();
  assert.equal(saved.tasks.length, 3); assert.equal(saved.tasks[1].importance, 3); assert.equal(saved.tasks[2].importance, 2);
  assert.equal(saved.schedulerRequests.length, 1);
});

test('여러 작업 중 마감이 빠진 것이 있으면 아무것도 저장하지 않고 그 작업만 묻는다', async t => {
  const h = await setup(t); const before = await readFile(h.dbPath, 'utf8');
  h.setInterpret({ ...extracted(), extraTasks: [extra('발표 준비', { deadline: null })] });
  const result = await h.request(input('multi-2'));
  assert.equal(result.body.status, 'needs_clarification'); assert.match(result.body.reply, /발표 준비/);
  assert.doesNotMatch(result.body.reply, /보고서/);
  assert.equal(h.breakdownCalls(), 0); assert.equal(await readFile(h.dbPath, 'utf8'), before);
});

test('여러 작업 중 이미 등록된 과제는 건너뛰고 나머지만 저장하며 수정 여부를 묻는다', async t => {
  const h = await setup(t);
  assert.equal((await h.request(input('multi-3a'))).status, 200);
  h.setInterpret({ ...extracted(), extraTasks: [extra('발표 준비'), extra('발표  준비')] });
  const result = await h.request(input('multi-3b', { text: '보고서랑 발표 준비' }));
  assert.equal(result.status, 200); assert.deepEqual(result.body.result.tasks.map(task => task.title), ['발표 준비']);
  assert.deepEqual(result.body.result.duplicates.map(task => task.title), ['보고서']);
  assert.match(result.body.reply, /‘보고서’은\(는\) 이미 등록된 과제라 건너뛰었어요/);
  assert.equal((await h.readDb()).tasks.length, 2);
  h.setInterpret({ ...extracted(), extraTasks: [extra('발표 준비')] });
  const all = await h.request(input('multi-3c'));
  assert.equal(all.body.status, 'needs_clarification'); assert.equal(all.body.result.duplicates.length, 2);
  assert.equal((await h.readDb()).tasks.length, 2);
});

test('한 번에 10개를 넘는 작업은 거부', async t => {
  const h = await setup(t);
  h.setInterpret({ ...extracted(), extraTasks: Array.from({ length: 10 }, (_, i) => extra(`작업${i}`)) });
  assert.equal((await h.request(input('multi-4'))).status, 400);
  assert.equal(h.breakdownCalls(), 0);
});

test('모델이 clarify로 분류해도 여러 과제 중 일부만 중복이면 새 과제는 저장하고 중복만 안내', async t => {
  const h = await setup(t);
  assert.equal((await h.request(input('part-1'))).status, 200);
  h.setInterpret({ ...extracted('clarify'), reply: '이미 등록된 과제예요. 수정할까요?', extraTasks: [extra('알고리즘'), extra('빅데이터')] });
  const result = await h.request(input('part-2', { text: '보고서랑 알고리즘, 빅데이터 해야 해' }));
  assert.equal(result.status, 200); assert.deepEqual(result.body.result.tasks.map(task => task.title), ['알고리즘', '빅데이터']);
  assert.deepEqual(result.body.result.duplicates.map(task => task.title), ['보고서']);
  assert.match(result.body.reply, /2개 작업을 .*‘보고서’은\(는\) 이미 등록된 과제라 건너뛰었어요/);
  assert.equal((await h.readDb()).tasks.length, 3);
  // 새 과제 정보가 부족하면 저장하지 않고 중복 안내만 한다
  h.setInterpret({ ...extracted('clarify'), reply: '이미 등록된 과제예요. 수정할까요?', extraTasks: [extra('물리', { deadline: null })] });
  const partial = await h.request(input('part-3'));
  assert.equal(partial.body.status, 'needs_clarification'); assert.equal(partial.body.result.duplicates.length, 1);
  assert.equal((await h.readDb()).tasks.length, 3);
});

test('시간을 말하지 않고 제이의 추정도 요청하지 않은 과제는 저장 전에 한 번에 되묻는다', async t => {
  const h = await setup(t); const before = await readFile(h.dbPath, 'utf8');
  h.setInterpret(extracted('add_task', { baseEstimatedMinutes: null }));
  const one = await h.request(input('time-1'));
  assert.equal(one.body.status, 'needs_clarification'); assert.match(one.body.reply, /‘보고서’.*제이가 정해줘/);
  assert.deepEqual(one.body.result.quickReplies, ['제이가 정해줘']);
  h.setInterpret({ ...extracted('add_task', { baseEstimatedMinutes: null }), extraTasks: [extra('알고리즘', { estimateByAi: false }), extra('빅데이터', { baseEstimatedMinutes: 90, estimateByAi: false })] });
  const many = await h.request(input('time-2'));
  assert.equal(many.body.status, 'needs_clarification');
  assert.match(many.body.reply, /‘보고서’, ‘알고리즘’은\(는\) 각각/); assert.doesNotMatch(many.body.reply, /빅데이터/);
  assert.deepEqual(many.body.result.quickReplies, ['다 제이가 정해줘']);
  assert.equal(h.breakdownCalls(), 0); assert.equal(await readFile(h.dbPath, 'utf8'), before);
  // 시간을 말하거나 제이에게 맡기면 저장한다
  h.setInterpret({ ...extracted('add_task', { baseEstimatedMinutes: null, estimateByAi: true }), extraTasks: [extra('알고리즘', { baseEstimatedMinutes: 120, estimateByAi: false })] });
  const saved = await h.request(input('time-3'));
  assert.equal(saved.status, 200); assert.equal(saved.body.result.tasks.length, 2);
});


test('같은 이름 과제는 다른 과제인지 묻고, 다르다고 하면 제목을 구분해 등록하며 빠진 정보는 되묻는다', async t => {
  const h = await setup(t);
  assert.equal((await h.request(input('dup-1'))).status, 200);
  // 같은 이름을 마감·시간 없이 말하면 기존 카드를 보여 주며 다른 과제인지, 빠진 정보는 무엇인지 안내
  h.setInterpret(extracted('add_task', { deadline: null, baseEstimatedMinutes: null }));
  const ask = await h.request(input('dup-2'));
  assert.equal(ask.body.status, 'needs_clarification'); assert.equal(ask.body.result.cardMode, 'existing');
  assert.match(ask.body.reply, /다른 새 과제인가요\? 다른 과제라면 마감일과 예상 소요시간도/);
  assert.deepEqual(ask.body.result.quickReplies, ['다른 과제예요', '같은 과제예요, 수정해 주세요']);
  // 다른 과제라고 답하면 마감이 없을 때 되묻는다
  h.setInterpret(extracted('add_task', { deadline: null, baseEstimatedMinutes: 90, distinctFromExisting: true }));
  assert.match((await h.request(input('dup-3'))).body.reply, /언제까지/);
  // 정보가 갖춰지면 '보고서 2'로 등록하고 기존 과제는 그대로
  h.setInterpret(extracted('add_task', { baseEstimatedMinutes: 120, distinctFromExisting: true }));
  const saved = await h.request(input('dup-4'));
  assert.equal(saved.status, 200); assert.equal(saved.body.result.task.title, '보고서 2');
  assert.deepEqual((await h.readDb()).tasks.map(task => task.title), ['보고서', '보고서 2']);
  assert.equal((await h.request(input('dup-5'))).body.result.task.title, '보고서 3');
});

const settled = async h => { for (let i = 0; i < 100; i++) { const status = await h.get('/scheduler/status'); if (!status.running) return status; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('배치가 끝나지 않았습니다.'); };

test('배치는 뒤에서 진행: 저장 후 바로 응답하고 배치 중에도 조회되며 끝나면 반영', async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const scheduler = async db => { await gate; const task = db.tasks.at(-1);
    return { rescheduled: true, changes: [], unplaced: [], scheduledBlocks: [{ id: 'sb', taskId: task.id, date: '2026-10-31', start: '10:00', end: '11:00', status: 'planned' }] }; };
  const h = await setup(t, { scheduler, backgroundScheduling: true });
  const res = await h.request(input('bg-1'));
  assert.equal(res.body.status, 'pending_schedule'); assert.equal(res.body.schedulingInBackground, true); assert.match(res.body.reply, /배치하는 중/);
  assert.equal((await h.readDb()).tasks.length, 1);
  assert.equal((await h.get('/scheduler/status')).running, true);
  release();
  const status = await settled(h);
  assert.equal(status.error, null); assert.equal(status.pending, 0);
  const saved = await h.readDb();
  assert.deepEqual(saved.scheduledBlocks.map(block => block.id), ['sb']); assert.equal(saved.schedulerRequests[0].status, 'processed');
});

test('배치가 실패해도 과제는 저장돼 있고 요청은 대기로 남으며 다시 실행할 수 있다', async t => {
  let fail = true;
  const scheduler = async db => { if (fail) throw new Error('전체 일정을 배치하는 AI 응답이 제한시간(120초)을 넘겼어요.');
    return { rescheduled: true, changes: [], unplaced: [], scheduledBlocks: [{ id: 'sb', taskId: db.tasks.at(-1).id, date: '2026-10-31', start: '10:00', end: '11:00', status: 'planned' }] }; };
  const h = await setup(t, { scheduler, backgroundScheduling: true });
  assert.equal((await h.request(input('bg-2'))).status, 200);
  const failed = await settled(h);
  assert.match(failed.error, /제한시간/); assert.equal(failed.pending, 1); assert.equal((await h.readDb()).tasks.length, 1);
  fail = false;
  assert.deepEqual(await h.request({}, '/scheduler/run'), { status: 200, body: { started: true } });
  const done = await settled(h);
  assert.equal(done.error, null); assert.equal(done.pending, 0); assert.equal((await h.readDb()).scheduledBlocks.length, 1);
});

test('배치 계산 중 일정이 바뀌면 오래된 결과는 버리고 다시 계산', async t => {
  let calls = 0, edit;
  const scheduler = async db => { calls++;
    if (calls === 1) await edit();
    return { rescheduled: true, changes: [], unplaced: [], scheduledBlocks: [{ id: `sb${calls}`, taskId: db.tasks[0].id, date: '2026-10-31', start: '10:00', end: '11:00', status: 'planned' }] }; };
  const h = await setup(t, { scheduler, backgroundScheduling: true });
  edit = () => h.updateDb(async db => { db.fixedBlocks.push({ id: 'new-fixed', kind: 'class', title: '수업', dayOfWeek: [6], start: '09:00', end: '10:00' }); return db; });
  assert.equal((await h.request(input('bg-3'))).status, 200);
  await settled(h);
  assert.equal(calls, 2); assert.deepEqual((await h.readDb()).scheduledBlocks.map(block => block.id), ['sb2']);
});
