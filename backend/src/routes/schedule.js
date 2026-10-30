import { normalizePlanningSettings } from '../services/ai-planner.js';
import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { explainSchedule } from '../scheduler/explanations.js';
import { timeline, weekTimeline, todayKst, mondayKst } from '../scheduler/timeline.js';
import { day } from '../scheduler/time.js';
import { fail, explainRequested } from '../services/validation.js';

const reasons = new Set(['new_task','missed','progress','manual']);
export function createScheduleRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date(), planner = reschedule } = {}) {
  const router = Router();
  router.get('/settings', async (req, res, next) => {
    try { res.json(normalizePlanningSettings((await readDb()).user.settings)); } catch (error) { next(error); }
  });
  router.put('/settings', async (req, res, next) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) fail('설정 JSON 객체가 필요합니다.');
      let result, settings;
      await updateDb(async db => {
        settings = normalizePlanningSettings({ ...db.user.settings, ...req.body });
        db.user.settings = settings;
        result = await planner(db, { now: now(), reason: 'manual' });
        db.scheduledBlocks = result.scheduledBlocks;
        return db;
      });
      res.json({ settings, ...result });
    } catch (error) { next(error); }
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
      const from = req.query.from ?? mondayKst(current);
      try { if (typeof from !== 'string') throw new Error(); day(from); } catch { fail('from은 유효한 YYYY-MM-DD여야 합니다.'); }
      res.json(weekTimeline(await readDb(), from, { explain, now: current }));
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
        const weekday = new Date(day(date)).getUTCDay();
        const exists = source === 'fixed'
          ? db.fixedBlocks.some(item => item.id === id && item.dayOfWeek.includes(weekday))
          : db.scheduledBlocks.some(item => item.id === id && item.date === date);
        if (!exists) fail('일정을 찾을 수 없습니다.', 404);
        const deleted = db.deletedCalendarItems ??= [];
        if (!deleted.some(item => item.source === source && item.id === id && item.date === date)) deleted.push({ source, id, date });
        return db;
      });
      res.json({ deleted: true });
    } catch (err) { next(err); }
  });
  router.post('/reschedule', async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !reasons.has(req.body.reason)) return res.status(400).json({error:'reason은 new_task, missed, progress, manual 중 하나여야 합니다.'});
    try {
      const explain = explainRequested(req.query);
      let result;
      await updateDb(async db => {
        const current = now();
        result = await planner(db, { now: current, reason: req.body.reason });
        if (explain) result.explanations = explainSchedule(db.tasks, result, { settings: db.user.settings, now: current });
        return { ...db, scheduledBlocks: result.scheduledBlocks };
      });
      res.json(result);
    } catch (err) { next(err); }
  });
  return router;
}
export default createScheduleRouter();
