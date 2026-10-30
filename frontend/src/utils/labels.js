// 화면 공통 표시용 문구

// 작업 중요도(importance 3·2·1) → Must·Should·Could
export const PRIORITY = {
  3: { label: 'Must', tone: 'must' },
  2: { label: 'Should', tone: 'should' },
  1: { label: 'Could', tone: 'could' },
};

export const priorityOf = (task) => PRIORITY[task?.importance ?? 2];

// 고정 일정 종류
export const FIXED_KIND_LABEL = { class: '수업', job: '알바', fixed: '고정 일정', routine: '루틴', event: '일정' };

export const TASK_TYPE_LABEL = {
  report: '과제',
  coding: '과제',
  exam: '시험',
  presentation: '발표',
  reading: '과제',
  etc: '작업',
};

/** "11월 19일 목요일" */
export function formatLongDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
}

/** "09:15" */
export function formatClock(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 오늘 0시 기준 남은 날짜 수 (마감 ISO 문자열) */
export function daysUntil(iso, from = new Date()) {
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`) - today) / 86400000);
}

// 받침 유무에 따라 조사를 고른다 (예: 수업 1개가, 운동이, 과제를)
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${withFinal}`;
  return `${word}${code % 28 ? withFinal : withoutFinal}`;
}

export const dDay = (days) => (days === 0 ? 'D-DAY' : days > 0 ? `D-${days}` : `D+${-days}`);
