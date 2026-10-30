import { dispatchPending } from './scheduler-gateway.js';
import { schedulingRevision } from '../scheduler/planning-context.js';

/**
 * 배치(AI 호출)는 오래 걸리므로 저장을 먼저 끝내고 뒤에서 한 번에 하나씩 실행한다.
 * 저장소 잠금 밖에서 사본으로 계획한 뒤, 그동안 일정이 바뀌지 않았을 때만 짧게 반영한다.
 * 실패해도 저장된 작업과 대기 중인 배치 요청은 그대로 남는다.
 */
export function createBackgroundScheduler({ readDb, updateDb, scheduler, now = () => new Date() }) {
  let run = null, lastError = null, rerun = false;

  async function once() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await readDb();
      if (!(snapshot.schedulerRequests ?? []).some(item => item.status === 'pending')) return;
      const draft = structuredClone(snapshot);
      await dispatchPending(draft, { scheduler, now: now() });
      let applied = false;
      await updateDb(async db => {
        if (schedulingRevision(db) !== schedulingRevision(snapshot)) return db;
        db.scheduledBlocks = draft.scheduledBlocks;
        if (draft.aiScheduling) db.aiScheduling = draft.aiScheduling;
        const processed = new Map((draft.schedulerRequests ?? []).filter(item => item.status === 'processed').map(item => [item.id, item]));
        db.schedulerRequests = (db.schedulerRequests ?? []).map(item => processed.get(item.id) ?? item);
        applied = true;
        return db;
      });
      if (applied) return;
    }
    throw new Error('배치하는 동안 일정이 계속 바뀌었어요. 잠시 후 다시 시도해 주세요.');
  }

  function start() {
    if (typeof scheduler !== 'function') return null;
    if (run) { rerun = true; return run; }
    lastError = null;
    run = (async () => {
      try {
        do { rerun = false; await once(); } while (rerun);
      } catch (error) {
        lastError = error.message || '일정을 배치하지 못했어요.';
      } finally { run = null; }
    })();
    return run;
  }

  async function status() {
    const db = await readDb();
    return { running: Boolean(run), error: lastError, pending: (db.schedulerRequests ?? []).filter(item => item.status === 'pending').length };
  }

  return { start, status };
}
