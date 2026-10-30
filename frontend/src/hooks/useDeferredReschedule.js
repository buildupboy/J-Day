import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { isRescheduling, onReschedulingChange } from '../api/rescheduling.js';
import { scheduleChanged } from './useLiveSchedule.js';

export const RESCHEDULE_DELAY_MS = 10000;
const RESULT_MS = 2500; // 시작·실패 안내를 보여 주는 시간

// 탭을 옮겨도 카운트다운이 이어지도록 화면 밖(모듈)에 둔다.
// phase: 'idle' | 'countdown' | 'running' | 'error'
let state = { phase: 'idle', endsAt: 0, error: null };
let timer = null;
const listeners = new Set();
const set = (next) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
};

async function run() {
  timer = null;
  set({ phase: 'running', error: null });
  try {
    await api.reschedule('progress');
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

// 체크박스를 누를 때마다 부른다. 10초 안에 또 누르면 처음부터 다시 센다.
export function queueReschedule() {
  clearTimeout(timer);
  set({ phase: 'countdown', endsAt: Date.now() + RESCHEDULE_DELAY_MS, error: null });
  timer = setTimeout(run, RESCHEDULE_DELAY_MS);
}

// 루틴·일정처럼 재배치가 필요 없는 체크도 카운트다운 중이면 다시 센다
export function delayPendingReschedule() {
  if (state.phase === 'countdown') queueReschedule();
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
