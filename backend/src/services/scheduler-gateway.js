import { randomUUID } from 'node:crypto';
import { fail } from './voice-validation.js';

/** 스케줄러 구현과 분리된 durable outbox. 스케줄러 미연결 시 배치 성공을 반환하지 않는다. */
export function enqueueSchedule(db, { commandId, taskId, reason, now }) {
  db.schedulerRequests ??= [];
  const request = { id: randomUUID(), commandId, taskId: taskId ?? null, reason,
    status: 'pending', createdAt: now.toISOString(), processedAt: null };
  db.schedulerRequests.push(request);
  return request;
}

/** 친구의 reschedule(db, { now, reason })를 주입한다. DB 저장은 호출자의 updateDb가 담당한다. */
export async function dispatchPending(db, { scheduler, now }) {
  if (typeof scheduler !== 'function') fail('스케줄러가 아직 연결되지 않았습니다. 요청은 배치 대기로 보관됩니다.', 503);
  const pending = (db.schedulerRequests ?? []).filter(request => request.status === 'pending');
  if (!pending.length) return { processedCount: 0, rescheduled: false, scheduledBlocks: db.scheduledBlocks ?? [] };
  const reason = pending.at(-1).reason;
  const result = await scheduler(db, { now, reason });
  if (!result || !Array.isArray(result.scheduledBlocks) || !Array.isArray(result.changes) || !Array.isArray(result.unplaced)) fail('스케줄러 반환 형식이 명세와 다릅니다.', 502);
  db.scheduledBlocks = result.scheduledBlocks;
  pending.forEach(request => { request.status = 'processed'; request.processedAt = now.toISOString(); });
  return { processedCount: pending.length, rescheduled: true, ...result };
}
