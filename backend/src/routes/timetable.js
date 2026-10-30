import { Router } from 'express';
import multer from 'multer';
import { readDb, updateDb } from '../store/index.js';
import { timetableBlocks } from '../services/fixed-blocks-service.js';
import { extractTimetable, validateTimetableImages, validateLessons, assertNoTimetableConflicts } from '../services/timetable.js';
const router = Router();
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
  try { const db = await readDb(); res.json({ visibleDays: db.timetableVisibleDays || [], lessons: (db.fixedBlocks || []).filter((block) => block.kind === 'class'), otherBlocks: (db.fixedBlocks || []).filter((block) => block.kind !== 'class') }); } catch (error) { next(error); }
});
router.post(['/extract', '/ocr'], receivePhoto, async (req, res, next) => {
  try { validateTimetableImages(req.body?.image, req.body?.details); } catch (error) { return res.status(400).json({ error: error.message }); }
  try { res.json(await extractTimetable(req.body.image, req.body.details)); } catch (error) { next(error); }
});
router.put('/', async (req, res, next) => {
  let lessons;
  try { lessons = validateLessons(req.body?.lessons); } catch (error) { return res.status(400).json({ error: error.message }); }
  try {
    // 사용자가 확인한 수업만 교체하고 알바·루틴은 보존한다.
    await updateDb((db) => {
      const otherBlocks = (db.fixedBlocks || []).filter((block) => block.kind !== 'class');
      assertNoTimetableConflicts(lessons, otherBlocks);
      db.fixedBlocks = [...otherBlocks, ...lessons];
      db.timetableVisibleDays = [...new Set([...(Array.isArray(req.body.visibleDays) ? req.body.visibleDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) : []), ...lessons.flatMap((lesson) => lesson.dayOfWeek)])];
    });
    res.json({ lessons });
  } catch (error) { next(error); }
});
// 수업·알바 한 건씩 추가/수정/삭제. 바꾸면 남은 작업을 다시 배치한다.
function change(handler, status = 200) {
  return async (req, res, next) => {
    try {
      let result;
      await updateDb((db) => { result = handler(db, req, { now: new Date() }); return db; });
      res.status(status).json(result);
    } catch (error) { next(error); }
  };
}
router.post('/', change((db, req, options) => timetableBlocks.create(db, req.body, options), 201));
router.patch('/:id', change((db, req, options) => timetableBlocks.update(db, req.params.id, req.body, options)));
router.delete('/:id', change((db, req, options) => timetableBlocks.remove(db, req.params.id, options)));
export default router;
