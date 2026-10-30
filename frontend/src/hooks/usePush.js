import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// VAPID 공개키(base64url) → applicationServerKey
function toKey(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// 푸시 알림 구독 상태와 켜기/끄기. iOS는 홈 화면에 추가한 PWA에서만 푸시가 동작한다.
export default function usePush() {
  const [state, setState] = useState({ supported: supported(), permission: supported() ? Notification.permission : 'denied', subscribed: false, busy: false, error: null });

  const patch = (next) => setState((s) => ({ ...s, ...next }));

  useEffect(() => {
    if (!supported()) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => patch({ subscribed: Boolean(sub) }))
      .catch(() => {});
  }, []);

  const enable = useCallback(async () => {
    patch({ busy: true, error: null });
    try {
      const { enabled, publicKey } = await api.getPushKey();
      if (!enabled) throw new Error('서버에 푸시 키가 설정되지 않았어요.');
      const permission = await Notification.requestPermission();
      patch({ permission });
      if (permission !== 'granted') throw new Error('알림 권한이 필요해요. 브라우저 설정에서 허용해 주세요.');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      await api.pushSubscribe(sub.toJSON());
      patch({ subscribed: true });
    } catch (error) {
      patch({ error: error.message });
    } finally {
      patch({ busy: false });
    }
  }, []);

  const disable = useCallback(async () => {
    patch({ busy: true, error: null });
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      patch({ subscribed: false });
    } catch (error) {
      patch({ error: error.message });
    } finally {
      patch({ busy: false });
    }
  }, []);

  const test = useCallback(async () => {
    patch({ error: null });
    try { await api.pushTest(); } catch (error) { patch({ error: error.message }); }
  }, []);

  return { ...state, enable, disable, test };
}
