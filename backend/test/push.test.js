import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSubscription, addSubscription, removeSubscription, sendPush } from '../src/services/push.js';

const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } });
const config = { enabled: true, publicKey: 'pub', privateKey: 'priv', subject: 'mailto:a@b.c' };

test('구독 정보 검증', () => {
  assert.equal(validSubscription(sub(1)), true);
  assert.equal(validSubscription({ endpoint: 'http://x', keys: { p256dh: 'p', auth: 'a' } }), false);
  assert.equal(validSubscription({ endpoint: 'https://x' }), false);
});

test('같은 endpoint는 한 번만 저장하고 삭제할 수 있다', () => {
  let db = addSubscription({}, sub(1));
  db = addSubscription(db, sub(1));
  db = addSubscription(db, sub(2));
  assert.equal(db.pushSubscriptions.length, 2);
  db = removeSubscription(db, sub(1).endpoint);
  assert.deepEqual(db.pushSubscriptions.map((s) => s.endpoint), [sub(2).endpoint]);
});

test('발송 시 기본 복귀 URL을 싣고, 만료 구독을 돌려준다', async () => {
  const bodies = [];
  const sender = {
    setVapidDetails() {},
    async sendNotification(s, body) {
      if (s.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      bodies.push(JSON.parse(body));
    },
  };
  const result = await sendPush([sub(1), sub('gone')], { title: '제이', body: 'hi' }, { config, sender });
  assert.equal(result.sent, 1);
  assert.deepEqual(result.expired, ['https://push.example/gone']);
  assert.equal(bodies[0].url, '/chat?source=notification');
});

test('VAPID 키가 없으면 보내지 않는다', async () => {
  const result = await sendPush([sub(1)], {}, { config: { enabled: false } });
  assert.deepEqual(result, { sent: 0, expired: [] });
});
