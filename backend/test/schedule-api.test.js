import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import { createScheduleRouter } from '../src/routes/schedule.js';
import { createJsonStore } from '../src/store/index.js';

const now = new Date('2026-10-30T15:00:30+09:00');
function fixture() {
  return {
    user: { settings: { dayStart:'07:00', dayEnd:'24:00', minSlotMinutes:30, maxBlockMinutes:90, breakMinutes:10 } },
    tasks: [{ id:'a',title:'report',type:'report',estimatedMinutes:120,progress:0,status:'todo',deadline:'2026-10-31T18:00:00+09:00' }],
    fixedBlocks: [{ id:'class',dayOfWeek:[5],start:'16:00',end:'17:00' }],
    scheduledBlocks: [{ id:'past',taskId:'a',date:'2026-10-30',start:'09:00',end:'10:00',status:'planned' }],
    history: [{ id:'history-kept' }], extra: { keep:true },
  };
}
async function temporaryStore(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'j-day-api-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  const seedPath = path.join(directory, 'seed.json');
  const dbPath = path.join(directory, 'db.json');
  await writeFile(seedPath, JSON.stringify(fixture()));
  const store = createJsonStore({ dbPath, seedPath });
  return { ...store, directory, dbPath, seedPath };
}
async function server(t, dependencies) {
  const app = express();
  app.use(express.json());
  app.use('/api/schedule', createScheduleRouter({ now: () => new Date(now), ...dependencies }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({error:err.message}));
  const running = app.listen(0, '127.0.0.1');
  await once(running, 'listening');
  t.after(() => new Promise(resolve => { running.close(resolve); running.closeAllConnections(); }));
  const url = `http://127.0.0.1:${running.address().port}/api/schedule/reschedule`;
  return async (body, raw=false) => fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:raw?body:JSON.stringify(body) });
}

test('HTTP 재배치 결과를 실제 임시 JSON에 저장하고 다른 데이터 보존', async t => {
  const store = await temporaryStore(t);
  const request = await server(t, { updateDb:store.updateDb });
  const response = await request({reason:'manual'});
  assert.equal(response.status,200);
  const result = await response.json();
  assert.deepEqual(Object.keys(result).sort(), ['changes','scheduledBlocks','unplaced']);
  assert.equal(result.scheduledBlocks.find(b=>b.id==='past').status,'missed');
  assert.deepEqual(result.unplaced,[]);
  const planned = result.scheduledBlocks.filter(b=>b.status==='planned');
  assert.equal(planned[0].start,'15:01');
  assert.ok(planned.every(b=>b.end<='16:00'||b.start>='17:00'));
  const saved = JSON.parse(await readFile(store.dbPath,'utf8'));
  assert.deepEqual(saved.scheduledBlocks,result.scheduledBlocks);
  const {scheduledBlocks,...others} = saved;
  const {scheduledBlocks:old,...expected} = fixture();
  assert.deepEqual(others,expected);
  const repeated = await (await request({reason:'manual'})).json();
  assert.deepEqual(repeated.scheduledBlocks,result.scheduledBlocks);
  assert.deepEqual(repeated.changes,[]);
});

test('4가지 사유 허용, 잘못된 사유/본문/JSON은 저장하지 않고 400', async t => {
  let calls=0;
  const request=await server(t,{updateDb:async updater=>{calls++;return updater(fixture());}});
  for(const reason of ['new_task','missed','progress','manual']) assert.equal((await request({reason})).status,200);
  assert.equal(calls,4);
  for(const body of [{},{reason:'unknown'},{reason:null},{reason:1},[],null]){
    const response=await request(body);
    assert.equal(response.status,400);
    assert.equal(typeof (await response.json()).error,'string');
  }
  assert.equal((await request('{',true)).status,400);
  assert.equal(calls,4);
});

test('저장 실패는 성공 응답 대신 500, 계산 오류도 기존 파일 보존', async t => {
  const failure=await server(t,{updateDb:async()=>{throw new Error('write failed');}});
  const response=await failure({reason:'manual'});
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'write failed'});
  const store=await temporaryStore(t);
  const invalid=fixture();
  invalid.tasks[0].progress=2;
  await store.writeDb(invalid);
  const before=await readFile(store.dbPath,'utf8');
  const request=await server(t,{updateDb:store.updateDb});
  assert.equal((await request({reason:'manual'})).status,500);
  assert.equal(await readFile(store.dbPath,'utf8'),before);
});

test('동시 재배치 요청은 순서대로 저장하며 두 번째 결과는 중복 없음',async t=>{
  const store=await temporaryStore(t);
  const request=await server(t,{updateDb:store.updateDb});
  const responses=await Promise.all([request({reason:'manual'}),request({reason:'manual'})]);
  assert.ok(responses.every(r=>r.status===200));
  const results=await Promise.all(responses.map(r=>r.json()));
  assert.deepEqual(results[0].scheduledBlocks,results[1].scheduledBlocks);
  assert.equal(results.filter(r=>r.changes.length===0).length,1);
  assert.deepEqual((await store.readDb()).scheduledBlocks,results[0].scheduledBlocks);
});

test('지난 마감은 정상 응답의 unplaced로 반환하고 클라이언트 now는 무시',async t=>{
  const store=await temporaryStore(t);
  const data=fixture();
  data.tasks[0].deadline='2026-10-29T18:00:00+09:00';
  await store.writeDb(data);
  const request=await server(t,{updateDb:store.updateDb});
  const response=await request({reason:'manual',now:'2026-10-28T09:00:00+09:00'});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.deepEqual(result.unplaced,[{taskId:'a',remainingMinutes:120}]);
  assert.equal(result.scheduledBlocks.filter(b=>b.status==='planned').length,0);
  assert.deepEqual((await store.readDb()).scheduledBlocks,result.scheduledBlocks);
});
