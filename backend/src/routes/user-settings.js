import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { mergeSettings, settingsSnapshot } from '../services/user-settings.js';
import { restConflictMessage } from '../../../shared/rest-conflicts.js';

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
        if (Object.hasOwn(req.body.settings, 'restPeriods')) {
          const conflict = restConflictMessage(settings.restPeriods, db.fixedBlocks ?? []);
          if (conflict) throw Object.assign(new Error(conflict), { status: 409 });
        }
        // AI가 입력을 변경한 뒤 실패해도 원래 일정·작업·이력을 보존한다.
        const saved = { ...db, user: { ...db.user, settings } };
        const candidate = structuredClone(saved);
        let result;
        try {
          result = await scheduler(candidate, { now: current, reason: 'manual' });
        } catch {
          // 이전 조건으로 만든 AI 결과는 새 설정에 적용할 수 없다.
          const next = { ...saved, aiScheduling: null };
          response = { ...settingsSnapshot(next, current), settingsSaved: true,
            schedulingStatus: 'failed', changes: [], unplaced: [],
            schedulingError: '설정은 저장했지만 AI 재배치에 실패했어요. 기존 일정은 유지돼요. 잠시 후 재배치를 다시 시도해 주세요.' };
          return next;
        }
        const next = { ...candidate, scheduledBlocks: result.scheduledBlocks, ...(result.planningContext && !result.rescheduled ? { aiScheduling: { status: 'pending', context: result.planningContext } } : {}) };
        response = { ...settingsSnapshot(next, current), settingsSaved: true, schedulingStatus: result.schedulingStatus, changes: result.changes,
          unplaced: result.unplaced.map((item) => ({ ...item, title: db.tasks.find((task) => task.id === item.taskId)?.title || '작업' })) };
        return next;
      });
      res.json(response);
    } catch (error) { next(error); }
  });
  return router;
}
export default createUserSettingsRouter();
