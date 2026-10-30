import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { nowState, todayView, upcoming, briefing } from '../services/home-service.js';
import { mutation, query } from './helpers.js';

export function createHomeRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date() } = {}) {
  const router = Router(), change = mutation({ updateDb, now }), read = query({ readDb, now });
  router.get('/today', read((db, req, options) => todayView(db, options.now)));
  router.get('/now', read((db, req, options) => nowState(db, options.now)));
  router.get('/upcoming', read((db, req, options) => upcoming(db, options.now)));
  // 재배치 제안을 저장하므로 쓰기 경로를 거친다.
  router.get('/briefing/today', change((db, req, options) => briefing(db, options.now)));
  return router;
}
export default createHomeRouter();
