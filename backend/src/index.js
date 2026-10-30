import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { createTasksRouter } from './routes/tasks.js';
import { planSchedule } from './services/ai-planner.js';
import { createScheduleRouter } from './routes/schedule.js';
import { createChatRouter } from './routes/chat.js';
import timetableRouter from './routes/timetable.js';
import analyticsRouter from './routes/analytics.js';
import { createUserSettingsRouter } from './routes/user-settings.js';
import { initStore } from './store/index.js';
import { createMissedMonitor } from './scheduler/missed-monitor.js';
import { reportProgress } from './services/task-service.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use('/api/timetable', express.json({ limit: '16mb' }), timetableRouter);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'j-day-backend', time: new Date().toISOString() });
});

app.use('/api/tasks', createTasksRouter({ planner: planSchedule }));
app.use('/api/schedule', createScheduleRouter({ planner: planSchedule }));
// 실제 배치는 AI, 우선순위/잔량 계산과 결과 검증만 코드에서 담당한다.
app.use('/api/chat', createChatRouter({ scheduler: planSchedule,
  progressReporter: (db, id, input, options) => reportProgress(db, id, input, { ...options, planner: planSchedule }) }));
app.use('/api/analytics', analyticsRouter);
app.use('/api/user', createUserSettingsRouter({ scheduler: planSchedule }));

// 공통 에러 핸들러
app.use((err, req, res, next) => {
  // 요청 본문에는 시간표 사진이 포함될 수 있으므로 오류 본문 전체를 기록하지 않는다.
  console.error(err.name, err.status || 500);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '사진은 5MB 이하로 올려 주세요.' });
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

await initStore();

const server = app.listen(PORT, () => {
  console.log(`[j-day] backend listening on http://localhost:${PORT}`);
});

// 주기 확인은 서버 프로세스에만 연결한다. 테스트의 router import로는 시작하지 않는다.
const monitor = createMissedMonitor({ planner: planSchedule });
if (process.env.AUTO_RESCHEDULE_ENABLED !== 'false') monitor.start();
server.on('close', () => monitor.stop());
