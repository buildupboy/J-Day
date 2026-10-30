import { Router } from 'express';
import { readDb, updateDb } from '../store/index.js';
import { extractTimetable, validateImage, validateLessons } from '../services/timetable.js';
const router = Router();
router.get('/', async (req, res, next) => {
  try { const db = await readDb(); res.json({ lessons: (db.fixedBlocks || []).filter((block) => block.kind === 'class') }); } catch (error) { next(error); }
});
router.post('/extract', async (req, res, next) => {
  try { validateImage(req.body?.image); } catch (error) { return res.status(400).json({ error: error.message }); }
  try { res.json(await extractTimetable(req.body.image)); } catch (error) { next(error); }
});
router.put('/', async (req, res, next) => {
  let lessons;
  try { lessons = validateLessons(req.body?.lessons); } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    // 사용자가 확인한 수업만 교체하고 알바·루틴은 보존한다.
    await updateDb((db) => { db.fixedBlocks = [...(db.fixedBlocks || []).filter((block) => block.kind !== 'class'), ...lessons]; });
    res.json({ lessons });
  } catch (error) { next(error); }
});
export default router;
