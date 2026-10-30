// 작업 알림: 마감 전(하루·1시간·30분) 토글과, 직접 고른 날짜·시간 하나. 마감·일시는 KST 오프셋이 붙은 ISO 문자열이다.

export const BEFORE_DEADLINE = [
  { minutes: 1440, label: '마감 하루 전' },
  { minutes: 60, label: '마감 1시간 전' },
  { minutes: 30, label: '마감 30분 전' },
];

export const remindersOf = (task) => task.reminders ?? [];

// 알림이 울릴 시각(ms) 목록
export function reminderTimes(task) {
  return remindersOf(task)
    .map((reminder) => (reminder.mode === 'at' ? Date.parse(reminder.at) : Date.parse(task.deadline) - reminder.minutes * 60000))
    .filter(Number.isFinite);
}

// 'YYYY-MM-DDTHH:mm:ss+09:00' ↔ { date: 'YYYY-MM-DD', time: 'HH:mm' } (저장된 KST 문자열을 그대로 쪼갠다)
export const splitIso = (iso) => ({ date: iso.slice(0, 10), time: iso.slice(11, 16) });
export const joinIso = (date, time) => `${date}T${time}:00+09:00`;
