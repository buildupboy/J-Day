import { Router } from 'express';
import { readDb } from '../store/index.js';

const router = Router();

// GET /api/tasks : 작업 목록
router.get('/', async (req, res, next) => {
  try {
    const db = await readDb();
    res.json(db.tasks);
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks : 작업 생성
router.post('/', async (req, res) => {
  // TODO: body 검증 → llm.breakdownTask → estimator 보정 → store 저장 → 재배치 트리거
  res.status(501).json({ error: 'Not implemented' });
});

// PATCH /api/tasks/:id/progress : 진행 보고 (진행률·실제 소요시간)
router.patch('/:id/progress', async (req, res) => {
  // TODO: 진행률 갱신 → 완료 시 history에 실제 소요시간 기록 → 미완료분 재배치
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
