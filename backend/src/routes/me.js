import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { getMe, getSettings, patchSettings } from '../services/settings-service.js';
import { routineBlocks } from '../services/fixed-blocks-service.js';
import { analyze, analysisPeriod } from '../services/analytics.js';
import { mutation, query } from './helpers.js';

/** 마이 탭: 프로필, 설정, 루틴, 주간 리포트. */
export function createMeRouter({ readDb = storedRead, updateDb = storedUpdate, now = () => new Date() } = {}) {
  const router = Router(), change = mutation({ updateDb, now }), read = query({ readDb, now });
  router.get('/me', read(db => getMe(db)));
  router.get('/settings', read(db => getSettings(db)));
  router.patch('/settings', change((db, req, options) => patchSettings(db, req.body, options)));
  router.get('/routines', read(db => routineBlocks.list(db)));
  router.post('/routines', change((db, req, options) => routineBlocks.create(db, req.body, options), 201));
  router.patch('/routines/:id', change((db, req, options) => routineBlocks.update(db, req.params.id, req.body, options)));
  router.delete('/routines/:id', change((db, req, options) => routineBlocks.remove(db, req.params.id, options)));
  router.get('/reports/weekly', read((db, req, options) => {
    const report = analyze(db, analysisPeriod(req.query.start, 'week', options.now));
    return report;
  }));
  return router;
}
export default createMeRouter();
