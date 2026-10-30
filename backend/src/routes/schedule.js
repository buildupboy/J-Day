import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { acceptAiPlan } from '../scheduler/ai-plan.js';
import { schedulingRevision } from '../scheduler/planning-context.js';
import { explainSchedule } from '../scheduler/explanations.js';
import { timeline, weekTimeline, todayKst, mondayKst } from '../scheduler/timeline.js';
import { day, instant } from '../scheduler/time.js';
import { fail, explainRequested } from '../services/validation.js';

const reasons = new Set(['new_task','missed','progress','manual']);
export function createScheduleRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date() } = {}) {
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
  router.post('/reschedule', async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !reasons.has(req.body.reason)) return res.status(400).json({ error:'reason은 new_task, missed, progress, manual 중 하나여야 합니다.' });
    if (req.body.horizonDays !== undefined && (!Number.isInteger(req.body.horizonDays) || req.body.horizonDays < 1 || req.body.horizonDays > 31)) return res.status(400).json({ error:'horizonDays는 1~31이어야 합니다.' });
    try {
      const explain = explainRequested(req.query);
      let result;
      await updateDb(db => {
        const current = now();
        result = reschedule(db, { now: current, reason: req.body.reason, horizonDays: req.body.horizonDays });
        if (explain) result.explanations = explainSchedule(db.tasks, result, { settings: db.user.settings, now: current });
        return { ...db, scheduledBlocks: result.scheduledBlocks, aiScheduling: { status:'pending', context: result.planningContext } };
      });
      res.json(result);
    } catch (err) { next(err); }
  });
  router.post('/apply', async (req, res, next) => {
    try {
      const explain = explainRequested(req.query);
      let result;
      await updateDb(db => {
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
