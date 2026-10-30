import { fail, object, text } from './validation.js';
import { assertNoTimetableConflicts } from './timetable.js';

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = ['title', 'location', 'start', 'end', 'dayOfWeek', 'memo'];
export const MEMO_MAX = 1000;

/** 고정 일정(수업·알바·루틴) 수정. 요일이 반복되는 원본을 바꾸므로 모든 반복에 적용된다. 재배치는 하지 않는다. */
export function updateFixedBlock(db, id, input) {
  object(input);
  const block = db.fixedBlocks.find(item => item.id === id);
  if (!block) fail('고정 일정을 찾을 수 없습니다.', 404);
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !FIELDS.includes(key))) fail('수정할 수 있는 항목은 이름, 장소, 시간, 요일, 메모입니다.');
  const next = { ...block };
  if (input.title !== undefined) next.title = text(input.title, 'title');
  if (input.location !== undefined) {
    if (typeof input.location !== 'string' || input.location.length > 150) fail('장소는 150자 이하여야 합니다.');
    next.location = input.location.trim();
  }
  if (input.start !== undefined) {
    if (!TIME.test(input.start)) fail('시작 시각 형식이 올바르지 않습니다.');
    next.start = input.start;
  }
  if (input.end !== undefined) {
    if (!TIME.test(input.end) && input.end !== '24:00') fail('종료 시각 형식이 올바르지 않습니다.');
    next.end = input.end;
  }
  if (input.dayOfWeek !== undefined) {
    if (!Array.isArray(input.dayOfWeek) || !input.dayOfWeek.length || input.dayOfWeek.some(day => !Number.isInteger(day) || day < 0 || day > 6)) fail('요일을 하나 이상 골라 주세요.');
    next.dayOfWeek = [...new Set(input.dayOfWeek)].sort();
  }
  if (next.start >= next.end) fail('시작은 종료보다 빨라야 합니다.');
  if (input.memo !== undefined) {
    if (typeof input.memo !== 'string' || input.memo.length > MEMO_MAX) fail(`메모는 ${MEMO_MAX}자 이하여야 합니다.`);
    if (input.memo.trim()) next.memo = input.memo; else delete next.memo;
  }
  assertNoTimetableConflicts([next], db.fixedBlocks.filter(item => item.id !== id));
  db.fixedBlocks = db.fixedBlocks.map(item => item.id === id ? next : item);
  return { block: next };
}
