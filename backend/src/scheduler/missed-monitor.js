import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { detectMissedBlocks, reschedule } from './rescheduler.js';

/** 단일 프로세스의 주기 확인. 중복 실행을 합치고 미수행이 있을 때 재배치한다. */
export function createMissedMonitor({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date(),
  intervalMs = 60000, onError = error => console.error('[scheduler]', error),
  setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) throw new RangeError('intervalMs는 1000 이상이어야 합니다.');
  let timer, pending;
  async function perform() {
    const snapshot = await readDb();
    if (detectMissedBlocks(snapshot.scheduledBlocks ?? [], snapshot.tasks, now()).length === 0) return null;
    let result = null;
    await updateDb(db => {
      const current = now();
      if (detectMissedBlocks(db.scheduledBlocks ?? [], db.tasks, current).length === 0) return db;
      result = reschedule(db, { now: current, reason: 'missed' });
      return { ...db, scheduledBlocks: result.scheduledBlocks, aiScheduling: { status: 'pending', context: result.planningContext } };
    });
    return result;
  }
  function check() {
    if (!pending) pending = perform().finally(() => { pending = undefined; });
    return pending;
  }
  function start() {
    if (timer !== undefined) return;
    timer = setIntervalFn(() => { check().catch(onError); }, intervalMs);
    timer?.unref?.();
  }
  function stop() { if (timer !== undefined) { clearIntervalFn(timer); timer = undefined; } }
  return { check, start, stop };
}
