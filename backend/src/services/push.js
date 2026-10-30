import webpush from 'web-push';

// VAPID 키는 백엔드 환경변수에서만 읽는다. 공개키만 프론트에 내려준다.
export function pushConfig(env = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT || 'mailto:admin@example.com';
  return { enabled: Boolean(publicKey && privateKey), publicKey, privateKey, subject };
}

export function validSubscription(sub) {
  return Boolean(sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://')
    && sub.keys?.p256dh && sub.keys?.auth);
}

/** 같은 endpoint는 한 번만 저장한다. */
export function addSubscription(db, sub) {
  const list = (db.pushSubscriptions ?? []).filter((s) => s.endpoint !== sub.endpoint);
  list.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  return { ...db, pushSubscriptions: list };
}

export function removeSubscription(db, endpoint) {
  return { ...db, pushSubscriptions: (db.pushSubscriptions ?? []).filter((s) => s.endpoint !== endpoint) };
}

/**
 * 모든 구독에 알림을 보낸다. 만료된 구독(404/410)의 endpoint를 돌려줘 호출자가 지우게 한다.
 * payload: { title, body, url } — url은 알림 클릭 시 열 PWA 경로(기본 /chat?source=notification)
 */
export async function sendPush(subscriptions, payload, { config = pushConfig(), sender = webpush } = {}) {
  if (!config.enabled) return { sent: 0, expired: [] };
  sender.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const body = JSON.stringify({ url: '/chat?source=notification', ...payload });
  const expired = [];
  let sent = 0;
  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await sender.sendNotification(sub, body);
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) expired.push(sub.endpoint);
    }
  }));
  return { sent, expired };
}
