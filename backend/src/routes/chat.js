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
  // 저장 뒤 뒤에서 도는 배치의 진행 상태와 재시도
  router.get('/scheduler/status', async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json(await service.schedulingStatus()); } catch (err) { next(err); }
  });
  router.post('/scheduler/run', async (req, res, next) => {
    try { res.json({ started: Boolean(service.startScheduling()) }); } catch (err) { next(err); }
  });
  return router;
}
export default createChatRouter();
