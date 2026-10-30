import { Router } from 'express';
import { readDb, updateDb } from '../store/index.js';
import { createVoiceService } from '../services/voice-command-service.js';

export function createChatRouter(options = {}) {
  const service = createVoiceService({ readDb, updateDb, ...options });
  const router = Router();
  router.post('/interpret', async (req, res, next) => {
    try { res.json(await service.interpret(req.body)); } catch (err) { next(err); }
  });
  router.post('/scheduler/dispatch', async (req, res, next) => {
    try { res.json(await service.dispatch()); } catch (err) { next(err); }
  });
  return router;
}
export default createChatRouter();
