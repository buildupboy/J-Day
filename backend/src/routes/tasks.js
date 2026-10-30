import { createTaskEstimator } from '../services/task-estimate.js';
import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { registerTask, reportProgress, registerReviews } from '../services/task-service.js';
import { explainRequested } from '../services/validation.js';

export function createTasksRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date(), planner, estimateTask = createTaskEstimator() } = {}) {
  const router = Router();
  router.get('/', async (req, res, next) => {
    try { res.json((await readDb()).tasks); } catch (err) { next(err); }
  });
  function change(handler, status) {
    return async (req, res, next) => {
      try {
        const explain = explainRequested(req.query);
        let result;
        await updateDb(async db => {
          result = await handler(db, req, { now: now(), explain, planner });
          return db;
        });
        res.status(status).json(result);
      } catch (err) { next(err); }
    };
  }
  // 추정 전용: DB 조회·저장·재배치를 실행하지 않는다.
  router.post('/estimate', async (req, res, next) => {
    try { res.json(await estimateTask(req.body)); } catch (error) { next(error); }
  });
  router.post('/', change((db, req, options) => registerTask(db, req.body, options), 201));
  router.patch('/:id/progress', change((db, req, options) => reportProgress(db, req.params.id, req.body, options), 200));
  router.post('/:id/reviews', change((db, req, options) => registerReviews(db, req.params.id, req.body, options), 200));
  return router;
}
export default createTasksRouter();
