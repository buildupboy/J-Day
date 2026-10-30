import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import tasksRouter from './routes/tasks.js';
import scheduleRouter from './routes/schedule.js';
import chatRouter from './routes/chat.js';
import { initStore } from './store/index.js';
import { createMissedMonitor } from './scheduler/missed-monitor.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'j-day-backend', time: new Date().toISOString() });
});

app.use('/api/tasks', tasksRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/chat', chatRouter);

// 공통 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

await initStore();

const server = app.listen(PORT, () => {
  console.log(`[j-day] backend listening on http://localhost:${PORT}`);
});

// 주기 확인은 서버 프로세스에만 연결한다. 테스트의 router import로는 시작하지 않는다.
const monitor = createMissedMonitor();
if (process.env.AUTO_RESCHEDULE_ENABLED !== 'false') monitor.start();
server.on('close', () => monitor.stop());
