import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import tasksRouter from './routes/tasks.js';
import scheduleRouter from './routes/schedule.js';
import chatRouter from './routes/chat.js';
import { initStore } from './store/index.js';

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

app.listen(PORT, () => {
  console.log(`[j-day] backend listening on http://localhost:${PORT}`);
});
