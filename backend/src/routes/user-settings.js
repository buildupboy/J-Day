import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { mergeSettings, settingsSnapshot } from '../services/user-settings.js';

export function createUserSettingsRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date(), scheduler = reschedule } = {}) {
  const router = Router();
  router.get('/settings', async (req, res, next) => {
    try { res.json(settingsSnapshot(await readDb(), now())); } catch (error) { next(error); }
  });
  router.patch('/settings', async (req, res, next) => {
    try {
      if (!req.body || req.body.confirmReschedule !== true) return res.status(409).json({ error: '저장하면 미래 예정 작업을 새 조건으로 재배치합니다. 확인 후 저장해 주세요.', confirmationRequired: true });
      let response;
      await updateDb(async (db) => {
        const current = now();
        const settings = mergeSettings(db.user?.settings, req.body.settings);
        const candidate = { ...db, user: { ...db.user, settings } };
        const result = await scheduler(candidate, { now: current, reason: 'manual' });
        const next = { ...candidate, scheduledBlocks: result.scheduledBlocks, ...(result.planningContext && !result.rescheduled ? { aiScheduling: { status: 'pending', context: result.planningContext } } : {}) };
        response = { ...settingsSnapshot(next, current), schedulingStatus: result.schedulingStatus, changes: result.changes,
          unplaced: result.unplaced.map((item) => ({ ...item, title: db.tasks.find((task) => task.id === item.taskId)?.title || '작업' })) };
        return next;
      });
      res.json(response);
    } catch (error) { next(error); }
  });
  return router;
}
export default createUserSettingsRouter();
