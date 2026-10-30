// JSON 파일 저장소. 나중에 DB로 바꿀 때 이 파일의 함수 시그니처만 유지하면 된다.
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const SEED_PATH = path.join(DATA_DIR, 'seed.json');

/** db.json이 없으면 seed.json을 복사해 초기화한다. */
export async function initStore() {
  try {
    await access(DB_PATH);
  } catch {
    await copyFile(SEED_PATH, DB_PATH);
    console.log('[store] db.json created from seed.json');
  }
}

/** 전체 데이터를 읽는다. */
export async function readDb() {
  await initStore();
  return JSON.parse(await readFile(DB_PATH, 'utf-8'));
}

/** 전체 데이터를 덮어쓴다. */
export async function writeDb(data) {
  await writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/** 읽기 → 변경 → 쓰기를 한 번에. updater는 db를 직접 수정하거나 새 객체를 반환한다. */
export async function updateDb(updater) {
  const db = await readDb();
  const next = (await updater(db)) ?? db;
  await writeDb(next);
  return next;
}

/** seed.json으로 되돌린다 (시연 전 초기화용). */
export async function resetDb() {
  await copyFile(SEED_PATH, DB_PATH);
}
