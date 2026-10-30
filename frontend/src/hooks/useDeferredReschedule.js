import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { isRescheduling, onReschedulingChange } from '../api/rescheduling.js';
import { scheduleChanged } from './useLiveSchedule.js';

export const CHECK_DELAY_MS = 10000; // 홈 오늘 할 일 체크
export const EDIT_DELAY_MS = 30000; // 그 밖의 작업 추가·수정·삭제·완료
const RESULT_MS = 2500; // 시작·실패 안내를 보여 주는 시간

// 탭을 옮겨도 카운트다운이 이어지도록 화면 밖(모듈)에 둔다.
// phase: 'idle' | 'countdown' | 'running' | 'error'
let state = { phase: 'idle', endsAt: 0, error: null };
let pending = { delayMs: CHECK_DELAY_MS, reason: 'progress' };
let timer = null;
// 이번 카운트다운을 요청한 동작들. 실행 취소한 동작은 빠지고, 남은 동작이 없으면 카운트다운도 멈춘다
const requests = new Set();
const listeners = new Set();
const set = (next) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
};

async function run() {
  timer = null;
  requests.clear();
  set({ phase: 'running', error: null });
  try {
    await api.reschedule(pending.reason);
    // 재배치하는 동안 다른 체크박스를 눌러 새 카운트다운이 시작됐으면 그쪽 안내를 그대로 둔다
    if (state.phase === 'running') set({ phase: 'idle' });
  } catch (error) {
    if (state.phase === 'running') {
      set({ phase: 'error', error: error.message });
      setTimeout(() => state.phase === 'error' && set({ phase: 'idle' }), RESULT_MS);
    }
  } finally {
    scheduleChanged();
  }
}

function restart(delayMs) {
  clearTimeout(timer);
  set({ phase: 'countdown', endsAt: Date.now() + delayMs, error: null });
  timer = setTimeout(run, delayMs);
}

// 작업이 바뀔 때마다 부른다. 카운트다운 중에 또 부르면 새 시간으로 처음부터 다시 센다.
// reason은 POST /api/schedule/reschedule의 사유다 (progress | new_task | manual).
// 돌려받은 값을 cancelQueuedReschedule에 넘기면 그 요청만 취소한다.
export function queueReschedule({ delayMs = CHECK_DELAY_MS, reason = 'progress' } = {}) {
  const request = Symbol('reschedule');
  requests.add(request);
  pending = { delayMs, reason };
  restart(delayMs);
  return request;
}

// 실행 취소한 동작의 재배치 요청을 뺀다. 다른 동작이 남아 있으면 카운트다운은 그대로 이어진다
export function cancelQueuedReschedule(request) {
  if (!requests.delete(request) || requests.size || state.phase !== 'countdown') return;
  clearTimeout(timer);
  timer = null;
  set({ phase: 'idle' });
}

// 루틴·일정처럼 재배치가 필요 없는 체크도 카운트다운 중이면 다시 센다
export function delayPendingReschedule() {
  if (state.phase === 'countdown') restart(pending.delayMs);
}

export default function useDeferredReschedule() {
  const [current, setCurrent] = useState(state);
  const [, setTick] = useState(0);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(state);
    return () => listeners.delete(setCurrent);
  }, []);
  // 카운트다운 숫자가 줄어들도록 다시 그린다
  useEffect(() => {
    if (current.phase !== 'countdown') return undefined;
    const ticker = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(ticker);
  }, [current.phase]);
  const secondsLeft = current.phase === 'countdown' ? Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000)) : 0;
  return { ...current, secondsLeft };
}

// 어떤 이유로든 서버가 작업을 다시 배치하는 중인지
export function useRescheduling() {
  const [busy, setBusy] = useState(isRescheduling);
  useEffect(() => {
    setBusy(isRescheduling());
    return onReschedulingChange(setBusy);
  }, []);
  return busy;
}
