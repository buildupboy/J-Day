import { useEffect, useState } from 'react';

// 실수 방지: 완료·삭제·수정 직후 잠깐 '실행 취소'를 보여 준다.
// - commit이 있으면 그동안 서버 반영을 미룬다 (완료·삭제처럼 서버에서 되돌릴 수 없는 동작).
//   화면은 markPending으로 먼저 바뀐 것처럼 보여 준다.
// - commit이 없으면 이미 저장된 변경을 undo가 되돌린다 (수정).
export const UNDO_MS = 5000;
const NOTICE_MS = 3000;

let offer = null; // { message, undo, commit, timer }
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener(offer));

// 아직 서버에 보내지 않은 완료·삭제. 'done:블록id' | 'taskDone:작업id' | 'task:작업id' | 'subtask:하위작업id'
const pending = new Set();
const emitPending = () => window.dispatchEvent(new Event('undo-pending-changed'));
export const isPending = (key) => pending.has(key);
export function markPending(key, on) {
  if (on) pending.add(key);
  else pending.delete(key);
  emitPending();
}

function close(target) {
  clearTimeout(target.timer);
  if (offer === target) {
    offer = null;
    emit();
  }
}

function settle(target) {
  close(target);
  return target.commit?.();
}

// 새 동작이 오면 앞의 동작은 바로 확정한다
export function offerUndo({ message, undo, commit }) {
  if (offer) settle(offer);
  const target = { message, undo, commit };
  target.timer = setTimeout(() => settle(target), UNDO_MS);
  offer = target;
  emit();
}

// 실행 취소 없이 잠깐 안내만 한다 (실패 안내 등)
export function notify(message) {
  if (offer) settle(offer);
  const target = { message };
  target.timer = setTimeout(() => close(target), NOTICE_MS);
  offer = target;
  emit();
}

export async function undoLast() {
  const target = offer;
  if (!target?.undo) return;
  close(target);
  try {
    await target.undo();
  } catch (error) {
    notify(`되돌리지 못했어요. ${error.message}`);
  }
}

// 창을 닫더라도 미뤄 둔 완료·삭제는 보내 본다
window.addEventListener('pagehide', () => offer && settle(offer));

export default function useUndoOffer() {
  const [current, setCurrent] = useState(offer);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(offer);
    return () => listeners.delete(setCurrent);
  }, []);
  return current;
}

// 미뤄 둔 완료·삭제가 바뀌면 다시 그린다
export function usePendingChanges() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    window.addEventListener('undo-pending-changed', update);
    return () => window.removeEventListener('undo-pending-changed', update);
  }, []);
}
