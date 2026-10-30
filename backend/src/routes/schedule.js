import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { explainSchedule } from '../scheduler/explanations.js';
import { timeline, weekTimeline, todayKst, mondayKst } from '../scheduler/timeline.js';
import { day } from '../scheduler/time.js';
import { fail, explainRequested } from '../services/validation.js';

const reasons = new Set(['new_task','missed','progress','manual']);
export function createScheduleRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date() } = {}) {
  const router = Router();
  // 명세: GET /schedule?date=YYYY-MM-DD (없으면 오늘)
  router.get('/', async (req, res, next) => {
    try {
      const explain = explainRequested(req.query), current = now();
      const date = req.query.date ?? todayKst(current);
      try { if (typeof date !== 'string') throw new Error(); day(date); } catch { fail('date는 유효한 YYYY-MM-DD여야 합니다.'); }
      res.json(timeline(await readDb(), date, { explain, now: current }));
    } catch (err) { next(err); }
  });
  router.get('/today', async (req, res, next) => {
    try {
      const explain = explainRequested(req.query), current = now();
      res.json(timeline(await readDb(), todayKst(current), { explain, now: current }));
    } catch (err) { next(err); }
  });
  router.get('/week', async (req, res, next) => {
    try {
      const explain = explainRequested(req.query), current = now();
      const from = req.query.start ?? req.query.from ?? mondayKst(current);
      try { if (typeof from !== 'string') throw new Error(); day(from); } catch { fail('from은 유효한 YYYY-MM-DD여야 합니다.'); }
      res.json(weekTimeline(await readDb(), from, { explain, now: current }));
    } catch (err) { next(err); }
  });
  router.post('/reschedule', async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !reasons.has(req.body.reason)) return res.status(400).json({error:'reason은 new_task, missed, progress, manual 중 하나여야 합니다.'});
    try {
      const explain = explainRequested(req.query);
      let result;
      await updateDb(db => {
        const current = now();
        result = reschedule(db, { now: current, reason: req.body.reason });
        if (explain) result.explanations = explainSchedule(db.tasks, result, { settings: db.user.settings, now: current });
        return { ...db, scheduledBlocks: result.scheduledBlocks };
      });
      res.json(result);
    } catch (err) { next(err); }
  });
  return router;
}
export default createScheduleRouter();
