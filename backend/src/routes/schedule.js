import { Router } from 'express';
import { updateDb as updateStoredDb } from '../store/index.js';
import { reschedule } from '../scheduler/rescheduler.js';

const reasons = new Set(['new_task', 'missed', 'progress', 'manual']);

// 저장소와 시계는 테스트에서 교체한다. 실제 요청의 now는 서버 시계를 사용한다.
export function createScheduleRouter({ updateDb = updateStoredDb, now = () => new Date() } = {}) {
  const router = Router();

  router.get('/today', async (req, res) => {
    // TODO: 고정 일정과 배치된 작업의 오늘 타임라인 조회
    res.status(501).json({ error: 'Not implemented' });
  });

  router.post('/reschedule', async (req, res, next) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || !reasons.has(req.body.reason)) {
      return res.status(400).json({ error: 'reason은 new_task, missed, progress, manual 중 하나여야 합니다.' });
    }
    try {
      let result;
      await updateDb(db => {
        // DB 갱신 차례가 왔을 때 현재 시각을 잡아 오래 기다린 요청도 과거에 배치하지 않는다.
        result = reschedule(db, { now: now(), reason: req.body.reason });
        return { ...db, scheduledBlocks: result.scheduledBlocks };
      });
      return res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createScheduleRouter();
