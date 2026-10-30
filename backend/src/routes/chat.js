import { Router } from 'express';

const router = Router();

// POST /api/chat/interpret : 음성 인식 텍스트 해석
// body: { text: string }
router.post('/interpret', async (req, res) => {
  // TODO: services/llm.interpretUtterance로 의도 파악 (작업 등록 / 진행 보고 / 일정 조회 ...)
  //       → 의도에 맞는 핸들러 호출 → 제이의 응답 문장 반환
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
