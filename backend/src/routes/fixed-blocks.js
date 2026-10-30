import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { day, minute } from '../scheduler/time.js';
import { fail, object, text, memo } from '../services/validation.js';
import { assertNoTimetableConflicts } from '../services/timetable.js';

// 앱에서 직접 등록하는 고정 일정(일정·루틴·고정 일정·알바·수업). 사진으로 읽은 시간표 일괄 저장은 /api/timetable이 맡는다.
const kinds = new Set(['event', 'routine', 'fixed', 'job', 'class']);

export function validateFixedBlock(input) {
  object(input);
  if (!kinds.has(input.kind)) fail('kind는 event, routine, fixed, job, class 중 하나여야 합니다.');
  const title = text(input.title, 'title').slice(0, 100);
  let start, end;
  try { start = minute(input.start); end = minute(input.end); } catch { fail('start·end는 HH:mm 형식이어야 합니다.'); }
  if (start >= end) fail('종료 시간은 시작 시간보다 늦어야 합니다.');
  const block = { id: randomUUID(), kind: input.kind, title, start: input.start, end: input.end };
  if (input.date !== undefined) {
    // 하루만 있는 일정: dayOfWeek는 그날의 요일로 맞춰 둔다 (요일만 보는 기존 코드와 호환)
    try { block.dayOfWeek = [new Date(day(input.date)).getUTCDay()]; } catch { fail('date는 유효한 YYYY-MM-DD여야 합니다.'); }
    block.date = input.date;
  } else {
    const days = input.dayOfWeek;
    if (!Array.isArray(days) || !days.length || days.some(value => !Number.isInteger(value) || value < 0 || value > 6)) fail('date 또는 0~6 요일 배열 dayOfWeek가 필요합니다.');
    block.dayOfWeek = [...new Set(days)].sort();
  }
  if (input.location !== undefined) {
    if (typeof input.location !== 'string' || input.location.length > 150) fail('location 값이 올바르지 않습니다.');
    if (input.location.trim()) block.location = input.location.trim();
  }
  if (input.openEnd === true) block.openEnd = true;
  const note = memo(input.memo);
  if (note) block.memo = note;
  return block;
}

export function createFixedBlocksRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date(), planner = reschedule } = {}) {
  const router = Router();
  router.get('/', async (req, res, next) => {
    try { res.json((await readDb()).fixedBlocks); } catch (err) { next(err); }
  });

  // 고정 일정이 바뀌면 겹치는 작업이 다른 시간으로 옮겨지도록 다시 배치한다.
  // 배치(AI)가 실패해도 일정 자체는 저장하고, 응답에 배치 실패를 알린다.
  function change(handler, status) {
    return async (req, res, next) => {
      try {
        let result;
        await updateDb(async db => {
          const block = handler(db, req);
          result = { block, rescheduled: false };
          try {
            const planned = await planner(db, { now: now(), reason: 'manual' });
            db.scheduledBlocks = planned.scheduledBlocks;
            if (planned.planningContext && !planned.rescheduled) db.aiScheduling = { status: 'pending', context: planned.planningContext };
            result = { block, rescheduled: true, unplaced: planned.unplaced ?? [] };
          } catch (error) {
            result.rescheduleError = error.message;
          }
          return db;
        });
        res.status(status).json(result);
      } catch (err) { next(err); }
    };
  }

  router.post('/', change((db, req) => {
    const block = validateFixedBlock(req.body);
    if (block.kind === 'class') {
      if (block.date) fail('수업은 요일마다 반복하는 일정으로 등록해 주세요.');
      // 시간표 저장과 같은 규칙: 수업은 다른 반복 일정과 겹치면 안 된다
      assertNoTimetableConflicts([block], db.fixedBlocks.filter(item => !item.date));
      block.source = 'manual';
    }
    db.fixedBlocks.push(block);
    return block;
  }, 201));

  router.delete('/:id', change((db, req) => {
    const block = db.fixedBlocks.find(item => item.id === req.params.id);
    if (!block) fail('고정 일정을 찾을 수 없습니다.', 404);
    if (block.kind === 'class') fail('수업은 시간표 화면에서 수정해 주세요.', 409);
    db.fixedBlocks = db.fixedBlocks.filter(item => item.id !== block.id);
    return block;
  }, 200));
  return router;
}
export default createFixedBlocksRouter();
