import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import tasksRouter from './routes/tasks.js';
import scheduleRouter from './routes/schedule.js';
import chatRouter from './routes/chat.js';
import timetableRouter from './routes/timetable.js';
import analyticsRouter from './routes/analytics.js';
import { initStore } from './store/index.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use('/api/timetable', express.json({ limit: '8mb' }), timetableRouter);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'j-day-backend', time: new Date().toISOString() });
});

app.use('/api/tasks', tasksRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/chat', chatRouter);
app.use('/api/analytics', analyticsRouter);

// 공통 에러 핸들러
app.use((err, req, res, next) => {
  // 요청 본문에는 시간표 사진이 포함될 수 있으므로 오류 본문 전체를 기록하지 않는다.
  console.error(err.name, err.status || 500);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '사진은 5MB 이하로 올려 주세요.' });
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

await initStore();

app.listen(PORT, () => {
  console.log(`[j-day] backend listening on http://localhost:${PORT}`);
});
