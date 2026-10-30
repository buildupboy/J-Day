// 서버가 작업을 다시 배치하는 요청이 진행 중인지 화면 어디서든 알 수 있게 센다.
// 재배치 중에는 서버가 일정 조회를 끝날 때까지 미루므로, 화면은 이 값을 보고 로딩을 띄운다.
let running = 0;
const listeners = new Set();

export const isRescheduling = () => running > 0;

export function onReschedulingChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function trackRescheduling(promise) {
  running += 1;
  listeners.forEach((listener) => listener(true));
  try {
    return await promise;
  } finally {
    running -= 1;
    listeners.forEach((listener) => listener(running > 0));
  }
}
