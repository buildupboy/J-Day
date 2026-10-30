import { Router } from 'express';

const router = Router();

// GET /api/schedule/today : 오늘 타임라인 (고정 일정 + 배치된 작업 블록)
router.get('/today', async (req, res) => {
  // TODO: 오늘 요일의 fixedBlocks + 오늘 날짜의 scheduledBlocks 합쳐 시간순 정렬 후 반환
  res.status(501).json({ error: 'Not implemented' });
});

// POST /api/schedule/reschedule : 재스케줄링
router.post('/reschedule', async (req, res) => {
  // TODO: scheduler/rescheduler.reschedule 호출 → 결과 저장 → 변경 내역 반환
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
