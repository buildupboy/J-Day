import { planSchedule } from '../services/ai-planner.js';
import { Router } from 'express';
import multer from 'multer';
import { readDb, updateDb } from '../store/index.js';
import { extractTimetable, validateTimetableImages, validateLessons, assertNoTimetableConflicts, appendTimetable, clearTimetable } from '../services/timetable.js';
const router = Router();
const isTimetableItem = (block) => block.kind === 'class' || (block.source === 'timetable' && ['job', 'event'].includes(block.kind));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
function receivePhoto(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  upload.single('image')(req, res, (error) => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '이미지는 10MB 이하로 올려 주세요.' : '사진을 받지 못했어요. 다시 선택해 주세요.' });
    if (!req.file) return res.status(400).json({ error: '사진을 선택해 주세요.' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) return res.status(415).json({ error: 'PNG, JPG, WebP 사진을 선택해 주세요.' });
    req.body = { image: `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` };
    next();
  });
}
router.get('/', async (req, res, next) => {
  try { const db = await readDb(); res.json({ visibleDays: db.timetableVisibleDays || [], lessons: (db.fixedBlocks || []).filter(isTimetableItem), otherBlocks: (db.fixedBlocks || []).filter((block) => !isTimetableItem(block)) }); } catch (error) { next(error); }
});
router.post(['/extract', '/ocr'], receivePhoto, async (req, res, next) => {
  try { validateTimetableImages(req.body?.image, req.body?.details); } catch (error) { return res.status(400).json({ error: error.message }); }
  try { res.json(await extractTimetable(req.body.image, req.body.details)); } catch (error) { next(error); }
});
router.post('/', async (req, res, next) => {
  try { validateLessons(req.body?.lessons); } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    let lessons;
    await updateDb(async (db) => {
      lessons = appendTimetable(db, req.body.lessons, Array.isArray(req.body.visibleDays) ? req.body.visibleDays : []);
      const result = await planSchedule(db, { now: new Date(), reason: 'manual' });
      db.scheduledBlocks = result.scheduledBlocks;
    });
    res.status(201).json({ lessons });
  } catch (error) { next(error); }
});
router.delete('/', async (_req, res, next) => {
  try {
    await updateDb((db) => {
      clearTimetable(db);
    });
    res.json({ cleared: true });
  } catch (error) { next(error); }
});
router.put('/', async (req, res, next) => {
  let lessons;
  try { lessons = validateLessons(req.body?.lessons); } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    // 목록 비우기와 새 시간표 저장은 하나의 트랜잭션에서 반영한다.
    await updateDb(async (db) => {
      if (req.body.clearExisting === true) clearTimetable(db);
      const otherBlocks = (db.fixedBlocks || []).filter((block) => !isTimetableItem(block));
      const existingIds = new Set((db.fixedBlocks || []).filter(isTimetableItem).map((block) => block.id));
      lessons = lessons.map((lesson, index) => existingIds.has(req.body.lessons[index]?.id) ? { ...lesson, id: req.body.lessons[index].id } : lesson);
      assertNoTimetableConflicts(lessons, otherBlocks);
      db.fixedBlocks = [...otherBlocks, ...lessons];
      if (lessons.length) {
        const result = await planSchedule(db, { now: new Date(), reason: 'manual' });
        db.scheduledBlocks = result.scheduledBlocks;
      }
      db.timetableVisibleDays = [...new Set([...(Array.isArray(req.body.visibleDays) ? req.body.visibleDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : []), ...lessons.flatMap((lesson) => lesson.dayOfWeek)])];
    });
    res.json({ lessons });
  } catch (error) { next(error); }
});
export default router;
