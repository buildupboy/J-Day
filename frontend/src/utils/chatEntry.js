// 알림·PiP에서 PWA로 돌아오는 진입점. `/chat?source=notification`처럼 열리면 대화 화면을 연다.
export function readChatEntry(loc = window.location) {
  if (loc.pathname !== '/chat') return null;
  return { source: new URLSearchParams(loc.search).get('source') || 'link' };
}

export function clearChatEntry() {
  if (window.location.pathname === '/chat') window.history.replaceState(null, '', '/');
}

// 대화 상태 복원: 앱이 백그라운드로 갔다 돌아오거나 알림으로 다시 열려도 대화가 이어진다.
const THREAD_KEY = 'jday-voice-thread';
const MAX_SAVED = 30;
const MAX_AGE_MS = 6 * 3600000;

export function loadThread() {
  try {
    const saved = JSON.parse(localStorage.getItem(THREAD_KEY));
    if (!saved || Date.now() - saved.at > MAX_AGE_MS) return [];
    return Array.isArray(saved.messages) ? saved.messages : [];
  } catch {
    return [];
  }
}

export function saveThread(messages) {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify({ at: Date.now(), messages: messages.slice(-MAX_SAVED) }));
  } catch { /* 저장 불가 환경에서는 복원만 못 한다 */ }
}
