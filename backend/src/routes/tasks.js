import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { registerTask, reportProgress, registerReviews } from '../services/task-service.js';
import { updateTask, deleteTask, addSubtask, updateSubtask, deleteSubtask } from '../services/task-edit.js';
import { explainRequested } from '../services/validation.js';

export function createTasksRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date(), planner } = {}) {
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
  router.post('/', change((db, req, options) => registerTask(db, req.body, options), 201));
  router.patch('/:id/progress', change((db, req, options) => reportProgress(db, req.params.id, req.body, options), 200));
  router.post('/:id/reviews', change((db, req, options) => registerReviews(db, req.params.id, req.body, options), 200));
  router.patch('/:id', change((db, req) => updateTask(db, req.params.id, req.body), 200));
  router.delete('/:id', change((db, req) => deleteTask(db, req.params.id), 200));
  router.post('/:id/subtasks', change((db, req) => addSubtask(db, req.params.id, req.body), 201));
  router.patch('/:id/subtasks/:subtaskId', change((db, req) => updateSubtask(db, req.params.id, req.params.subtaskId, req.body), 200));
  router.delete('/:id/subtasks/:subtaskId', change((db, req) => deleteSubtask(db, req.params.id, req.params.subtaskId), 200));
  return router;
}
export default createTasksRouter();
