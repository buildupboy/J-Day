import { Router } from 'express';
import { readDb as storedRead, updateDb as storedUpdate } from '../store/index.js';
import { pushConfig, validSubscription, addSubscription, removeSubscription, sendPush } from '../services/push.js';

export function createPushRouter({ readDb = storedRead, updateDb = storedUpdate, config = pushConfig, sender } = {}) {
  const router = Router();

  router.get('/key', (req, res) => {
    const c = config();
    res.json({ enabled: c.enabled, publicKey: c.enabled ? c.publicKey : null });
  });

  router.post('/subscribe', async (req, res, next) => {
    try {
      if (!validSubscription(req.body)) return res.status(400).json({ error: '푸시 구독 정보가 올바르지 않아요.' });
      await updateDb((db) => addSubscription(db, req.body));
      res.status(201).json({ ok: true });
    } catch (error) { next(error); }
  });

  router.delete('/subscribe', async (req, res, next) => {
    try {
      if (typeof req.body?.endpoint !== 'string') return res.status(400).json({ error: 'endpoint가 필요해요.' });
      await updateDb((db) => removeSubscription(db, req.body.endpoint));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  // 시연·확인용: 구독된 기기에 "대화하러 오세요" 알림을 보낸다.
  router.post('/test', async (req, res, next) => {
    try {
      const c = config();
      if (!c.enabled) return res.status(503).json({ error: '서버에 VAPID 키가 설정되지 않았어요.' });
      const db = await readDb();
      const result = await sendPush(db.pushSubscriptions ?? [], {
        title: '제이',
        body: req.body?.body || '제이가 할 얘기가 있대요. 눌러서 대화를 시작해 보세요.',
      }, { config: c, sender });
      if (result.expired.length) {
        await updateDb((d) => result.expired.reduce(removeSubscription, d));
      }
      res.json({ sent: result.sent });
    } catch (error) { next(error); }
  });

  return router;
}
export default createPushRouter();
