import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
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
test('동시 갱신을 직렬화하고 실패 뒤에도 복구, 임시 파일 정리', async t => {
  const store=await temporaryStore(t);
  await Promise.all(Array.from({length:12},()=>store.updateDb(async db=>({...db,count:(db.count??0)+1}))));
  assert.equal((await store.readDb()).count,12);
  const before=await readFile(store.dbPath,'utf8');
  await assert.rejects(store.updateDb(db=>{db.count=999;throw new Error('failed');}));
  assert.equal(await readFile(store.dbPath,'utf8'),before);
  const circular={};circular.self=circular;
  await assert.rejects(store.writeDb(circular));
  assert.equal(await readFile(store.dbPath,'utf8'),before);
  await store.updateDb(db=>({...db,count:13}));
  assert.equal((await store.readDb()).count,13);
  assert.deepEqual((await readdir(store.directory)).sort(),['db.json','seed.json']);
});
