// 파일 접근은 이 저장소 계층에서만 수행한다. 외부 함수 규약은 유지한다.
import { readFile, writeFile, copyFile, access, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 같은 서버 프로세스 안에서 갱신을 직렬화하고 완성된 JSON 파일로 교체한다. */
export function createJsonStore({ dbPath, seedPath }) {
  let pending = Promise.resolve();
  function enqueue(operation) {
    const result = pending.then(operation);
    // 실패한 쓰기 이후에도 다음 요청을 처리할 수 있게 한다.
    pending = result.catch(() => {});
    return result;
  }
  async function initStore() {
    try {
      await access(dbPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      try {
        await copyFile(seedPath, dbPath, constants.COPYFILE_EXCL);
      } catch (copyError) {
        if (copyError.code !== 'EEXIST') throw copyError;
      }
    }
  }
  async function load() {
    await initStore();
    return JSON.parse(await readFile(dbPath, 'utf8'));
  }
  async function save(data) {
    const temporary = `${dbPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, dbPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async function readDb() {
    await pending;
    return load();
  }
  function writeDb(data) {
    return enqueue(() => save(data));
  }
  function updateDb(updater) {
    return enqueue(async () => {
      const db = await load();
      const next = (await updater(db)) ?? db;
      await save(next);
      return next;
    });
  }
  function resetDb() {
    return enqueue(async () => save(JSON.parse(await readFile(seedPath, 'utf8'))));
  }
  return { initStore, readDb, writeDb, updateDb, resetDb };
}

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
export const { initStore, readDb, writeDb, updateDb, resetDb } = createJsonStore({
  dbPath: path.join(dataDir, 'db.json'), seedPath: path.join(dataDir, 'seed.json'),
});
