import { updateAvailability } from '../services/scheduling-constraints.js';
import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { acceptAiPlan } from '../scheduler/ai-plan.js';
import { schedulingRevision } from '../scheduler/planning-context.js';
import { explainSchedule } from '../scheduler/explanations.js';
import { timeline, weekTimeline, todayKst, mondayKst } from '../scheduler/timeline.js';
import { day, instant, occursOn } from '../scheduler/time.js';
import { fail, explainRequested } from '../services/validation.js';
import { updateFixedBlock } from '../services/fixed-edit.js';
import { postponeBlocks } from '../services/postpone.js';

const reasons = new Set(['new_task','missed','progress','manual']);
export function createScheduleRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date(), planner = reschedule } = {}) {
  const router = Router();
  router.get('/today', async (req, res, next) => {
    try {
      const explain = explainRequested(req.query), current = now();
      res.json(timeline(await readDb(), todayKst(current), { explain, now: current }));
    } catch (err) { next(err); }
  });
  router.get('/week', async (req, res, next) => {
    try {
      const explain = explainRequested(req.query), current = now();
      const from = req.query.from ?? mondayKst(current);
      try { if (typeof from !== 'string') throw new Error(); day(from); } catch { fail('from은 유효한 YYYY-MM-DD여야 합니다.'); }
      res.json(weekTimeline(await readDb(), from, { explain, now: current }));
    } catch (err) { next(err); }
  });
  router.get('/context', async (req, res, next) => {
    try {
      const db = await readDb(), state = db.aiScheduling;
      res.set('Cache-Control', 'no-store').json({ schedulingStatus: state?.status === 'applied' ? 'applied' : state ? 'awaiting_ai' : 'not_requested',
        planningContext: state?.context ?? null,
        stale: state ? (state.status === 'applied' ? state.appliedRevision : state.context.sourceRevision) !== schedulingRevision(db)
          || (state.status !== 'applied' && (db.scheduledBlocks ?? []).some(block => state.context.replaceableBlockIds.includes(block.id) && instant(block, 'start') < now().getTime())) : false });
    } catch (err) { next(err); }
  });
  // 개별 날짜의 항목만 숨긴다. 원본 작업과 반복 일정은 보존한다.
  router.delete('/items/:source/:id', async (req, res, next) => {
    try {
      const { source, id } = req.params;
      const date = req.body?.date;
      if (!['fixed', 'scheduled'].includes(source)) fail('지원하지 않는 일정 종류입니다.');
      try { if (typeof date !== 'string') throw new Error(); day(date); } catch { fail('유효한 일정 날짜가 필요합니다.'); }
      await updateDb(async db => {
        const exists = source === 'fixed'
          ? db.fixedBlocks.some(item => item.id === id && occursOn(item, date))
          : db.scheduledBlocks.some(item => item.id === id && item.date === date);
        if (!exists) fail('일정을 찾을 수 없습니다.', 404);
        const deleted = db.deletedCalendarItems ??= [];
        if (!deleted.some(item => item.source === source && item.id === id && item.date === date)) deleted.push({ source, id, date });
        return db;
      });
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });
  // 사용자가 고른 날짜·시각으로 작업 블록 미루기
  router.post('/blocks/postpone', async (req, res, next) => {
    try {
      let result;
      await updateDb(async db => { result = postponeBlocks(db, req.body, { now: now() }); return db; });
      res.json(result);
    } catch (err) { next(err); }
  });
  router.patch('/fixed/:id', async (req, res, next) => {
    try {
      let result;
      await updateDb(async db => { result = updateFixedBlock(db, req.params.id, req.body); return db; });
      res.json(result);
    } catch (err) { next(err); }
  });
  router.post('/reschedule', async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !reasons.has(req.body.reason)) return res.status(400).json({ error:'reason은 new_task, missed, progress, manual 중 하나여야 합니다.' });
    if (req.body.horizonDays !== undefined && (!Number.isInteger(req.body.horizonDays) || req.body.horizonDays < 1 || req.body.horizonDays > 31)) return res.status(400).json({ error:'horizonDays는 1~31이어야 합니다.' });
    try {
      const explain = explainRequested(req.query);
      let result;
      await updateDb(async db => {
        const current = now();
        updateAvailability(db, req.body, current);
        result = await planner(db, { now: current, reason: req.body.reason, horizonDays: req.body.horizonDays });
        if (explain) result.explanations = explainSchedule(db.tasks, result, { settings: db.user.settings, now: current });
        return { ...db, scheduledBlocks: result.scheduledBlocks, ...(result.planningContext && !result.rescheduled ? { aiScheduling: { status:'pending', context: result.planningContext } } : {}) };
      });
      res.json(result);
    } catch (err) { next(err); }
  });
  router.post('/apply', async (req, res, next) => {
    try {
      const explain = explainRequested(req.query);
      let result;
      await updateDb(async db => {
        const current = now();
        const { aiScheduling, ...response } = acceptAiPlan(db, req.body, { now: current });
        result = response;
        if (explain) result.explanations = explainSchedule(db.tasks, result, { settings: db.user.settings, now: current });
        const schedulerRequests = (db.schedulerRequests ?? []).map(request => request.status === 'pending'
          ? { ...request, status:'processed', processedAt: current.toISOString() } : request);
        return { ...db, scheduledBlocks: result.scheduledBlocks, aiScheduling, ...(db.schedulerRequests ? { schedulerRequests } : {}) };
      });
      res.json(result);
    } catch (err) { next(err); }
  });
  return router;
}
export default createScheduleRouter();
