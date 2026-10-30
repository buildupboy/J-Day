import { DAY, KST, datetime, positive } from './time.js';

/** 시험 과제와 별도로 지정한 날짜의 복습 Task를 만든다. DB 저장은 호출자 책임이다. */
export function createExamReviewTasks(examTask, { daysBefore = [7, 3, 1], minutes = 30 } = {}) {
  if (examTask.type !== 'exam') throw new RangeError('시험 과제만 복습을 생성할 수 있습니다.');
  if (typeof examTask.id !== 'string' || !examTask.id) throw new RangeError('시험 과제 ID가 필요합니다.');
  if (!Array.isArray(daysBefore) || daysBefore.length === 0) throw new RangeError('복습 간격 배열이 필요합니다.');
  positive(minutes, 'minutes');
  if (minutes > 1440) throw new RangeError('복습 시간은 하루 이하여야 합니다.');
  const offsets = [...new Set(daysBefore.map(value => positive(value, 'daysBefore'))) ].sort((a, b) => b - a);
  const examDate = new Date(datetime(examTask.deadline) + KST).toISOString().slice(0, 10);
  const midnight = Date.parse(examDate + 'T00:00:00Z');
  return offsets.map(offset => {
    const start = midnight - offset * DAY;
    const date = new Date(start).toISOString().slice(0, 10);
    const next = new Date(start + DAY).toISOString().slice(0, 10);
    return {
      id: `review-${examTask.id}-${offset}`, title: `${examTask.title} 복습 (${offset}일 전)`,
      type: 'exam', reviewOf: examTask.id, notBefore: `${date}T00:00:00+09:00`, deadline: `${next}T00:00:00+09:00`,
      importance: examTask.importance ?? 2, subtasks: [], estimatedMinutes: minutes,
      progress: 0, status: 'todo', createdAt: examTask.createdAt,
    };
  });
}
