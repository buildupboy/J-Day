import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { registerTask, reportProgress, registerReviews } from '../services/task-service.js';
import { explainRequested } from '../services/validation.js';
import { normalizeTaskInput, attachExtras, updateTask, deleteTask, completeTask, estimateTask } from '../services/task-extras.js';

export function createTasksRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date() } = {}) {
  const router = Router();
  router.get('/', async (req, res, next) => {
    try { res.json((await readDb()).tasks); } catch (err) { next(err); }
  });
  function change(handler, status) {
    return async (req, res, next) => {
      try {
        const explain = explainRequested(req.query);
        let result;
        await updateDb(db => {
          result = handler(db, req, { now: now(), explain });
          return db;
        });
        res.status(status).json(result);
      } catch (err) { next(err); }
    };
  }
  router.post('/', change((db, req, options) => {
    const result = registerTask(db, normalizeTaskInput(req.body), options);
    attachExtras(result.task, req.body);
    return { ...result, blocks: result.scheduledBlocks.filter(block => block.taskId === result.task.id) };
  }, 201));
  router.post('/estimate', async (req, res, next) => {
    try { res.json(await estimateTask(await readDb(), req.body)); } catch (err) { next(err); }
  });
  router.patch('/:id', change((db, req, options) => updateTask(db, req.params.id, req.body, options), 200));
  router.delete('/:id', change((db, req, options) => deleteTask(db, req.params.id, options), 200));
  router.post('/:id/complete', change((db, req, options) => completeTask(db, req.params.id, options), 200));
  router.patch('/:id/progress', change((db, req, options) => reportProgress(db, req.params.id, req.body, options), 200));
  router.post('/:id/reviews', change((db, req, options) => registerReviews(db, req.params.id, req.body, options), 200));
  return router;
}
export default createTasksRouter();
