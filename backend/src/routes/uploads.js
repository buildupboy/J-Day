import { Router } from 'express';
import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { updateDb as storedUpdate } from '../store/index.js';

const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation']);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/uploads');

/** 작업 첨부 파일. 디스크에 저장하고 메타데이터만 db.files에 기록한다. */
export function createUploadsRouter({ updateDb = storedUpdate, uploadDir = dir } = {}) {
  const router = Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, done) => mkdir(uploadDir, { recursive: true }).then(() => done(null, uploadDir), done),
      filename: (req, file, done) => done(null, `${randomUUID()}${path.extname(file.originalname).slice(0, 10).replace(/[^.\w]/g, '')}`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, done) => allowed.has(file.mimetype) ? done(null, true) : done(Object.assign(new Error('지원하지 않는 파일 형식이에요.'), { code: 'BAD_TYPE' })),
  });
  router.post('/', (req, res, next) => upload.single('file')(req, res, async error => {
    if (error) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.code === 'BAD_TYPE' ? 415 : 400;
      return res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '파일은 10MB 이하로 올려 주세요.' : error.message });
    }
    if (!req.file) return res.status(400).json({ error: '파일을 선택해 주세요.' });
    try {
      // multer는 파일명을 latin1로 읽는다.
      const record = { id: `f_${randomUUID().slice(0, 8)}`, name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
        mimeType: req.file.mimetype, size: req.file.size, stored: req.file.filename, createdAt: new Date().toISOString() };
      await updateDb(db => { db.files = [...(db.files ?? []), record]; return db; });
      res.status(201).json({ fileId: record.id, name: record.name, mimeType: record.mimeType, size: record.size });
    } catch (err) { next(err); }
  }));
  return router;
}
export default createUploadsRouter();
