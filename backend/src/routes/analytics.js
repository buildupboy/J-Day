import { Router } from 'express';
import { readDb } from '../store/index.js';
import { analyze, analysisPeriod } from '../services/analytics.js';
const router = Router();
for (const mode of ['week', 'month']) router.get('/' + mode, async (req, res, next) => {
  try { const period = analysisPeriod(req.query.from, mode); res.json(analyze(await readDb(), period)); } catch (error) { next(error); }
});
export default router;
