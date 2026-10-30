// 앱 셸만 캐시하고 /api 요청은 항상 네트워크로 보낸다.
const CACHE = 'jday-shell-v3';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;
  e.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/')))
  );
});

// Web Push: 서버가 { title, body, url }을 보낸다. 클릭하면 PWA 대화 화면(/chat)으로 돌아온다.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || '제이', {
      body: data.body || '제이가 할 얘기가 있어요.',
      icon: '/icons/icon-192.png?v=2',
      badge: '/icons/icon-192.png?v=2',
      tag: 'jday-chat',
      data: { url: data.url || '/chat?source=notification' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '/chat?source=notification', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        // 이미 열려 있으면 새로 열지 않고 앞으로 가져와 대화 화면을 열게 한다(대화 상태 유지).
        await open.focus();
        open.postMessage({ type: 'open-chat', source: 'notification' });
        return;
      }
      await self.clients.openWindow(target);
    })
  );
});
