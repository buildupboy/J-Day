import { randomUUID } from 'node:crypto';
import { minute } from '../scheduler/time.js';
import { assertNoTimetableConflicts } from './timetable.js';
import { fail, object, text } from './validation.js';
import { replan, hhmm } from './planner.js';

/** 시간표(class·job)와 루틴(routine)이 함께 쓰는 요일 반복 고정 일정 CRUD. */
export function createFixedBlockService(kinds, label) {
  const find = (db, id) => {
    const block = db.fixedBlocks.find(block => block.id === id && kinds.includes(block.kind));
    if (!block) fail(`${label}을(를) 찾을 수 없습니다.`, 404);
    return block;
  };
  function build(input, base = {}) {
    object(input);
    const merged = { ...base, ...input };
    const kind = merged.kind ?? kinds[0];
    if (!kinds.includes(kind)) fail(`kind는 ${kinds.join(', ')} 중 하나여야 합니다.`);
    const days = merged.dayOfWeek;
    if (!Array.isArray(days) || !days.length || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) fail('dayOfWeek는 0~6 정수 배열이어야 합니다.');
    const block = { id: base.id ?? randomUUID(), kind, title: text(merged.title, 'title'), dayOfWeek: [...new Set(days)].sort(),
      start: hhmm(merged.start, 'start'), end: hhmm(merged.end, 'end') };
    if (minute(block.start) >= minute(block.end)) fail('end는 start보다 늦어야 합니다.');
    if (merged.location) block.location = text(merged.location, 'location');
    if (base.source) block.source = base.source;
    return block;
  }
  const conflict = (db, block) => assertNoTimetableConflicts([block], db.fixedBlocks.filter(other => other.id !== block.id));
  return {
    list: db => db.fixedBlocks.filter(block => kinds.includes(block.kind)),
    create(db, input, { now }) {
      const block = build(input);
      conflict(db, block);
      db.fixedBlocks.push(block);
      return { item: block, ...replan(db, now) };
    },
    update(db, id, input, { now }) {
      const base = find(db, id), block = build(input, base);
      conflict(db, block);
      db.fixedBlocks[db.fixedBlocks.indexOf(base)] = block;
      return { item: block, ...replan(db, now) };
    },
    remove(db, id, { now }) {
      const block = find(db, id);
      db.fixedBlocks = db.fixedBlocks.filter(other => other !== block);
      return { deleted: id, ...replan(db, now) };
    },
  };
}
export const timetableBlocks = createFixedBlockService(['class', 'job'], '시간표 항목');
export const routineBlocks = createFixedBlockService(['routine'], '루틴');
