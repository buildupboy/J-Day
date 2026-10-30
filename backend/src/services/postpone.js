import { blockedWindows } from '../scheduler/blocked-windows.js';
import { KST, clock, day, instant, minute, timestamp } from '../scheduler/time.js';
import { fail, object } from './validation.js';

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * 사용자가 고른 날짜·시각으로 배치된 작업 블록을 미룬다. 묶여 보이는 블록(blockIds)은 간격을 유지한 채 함께 옮긴다.
 * 시각은 AI가 아니라 사용자가 정하므로 자동 보정하지 않고, 겹치거나 마감을 넘기면 거부한다.
 */
export function postponeBlocks(db, input, { now }) {
  object(input);
  const { blockIds, date, start } = input;
  if (!Array.isArray(blockIds) || !blockIds.length || blockIds.length > 50 || blockIds.some(id => typeof id !== 'string')) fail('미룰 일정을 골라 주세요.');
  if (typeof start !== 'string' || !TIME.test(start)) fail('시작 시각 형식이 올바르지 않습니다.');
  try { day(date); } catch { fail('유효한 날짜가 필요합니다.'); }
  const blocks = blockIds.map(id => db.scheduledBlocks?.find(block => block.id === id) ?? fail('일정을 찾을 수 없습니다.', 404));
  if (blocks.some(block => block.taskId !== blocks[0].taskId)) fail('같은 작업의 일정만 함께 미룰 수 있습니다.');
  if (blocks.some(block => block.status === 'done')) fail('완료한 일정은 미룰 수 없습니다.', 409);
  const task = db.tasks.find(item => item.id === blocks[0].taskId);

  blocks.sort((a, b) => instant(a, 'start') - instant(b, 'start'));
  const target = day(date) - KST + minute(start) * 60000;
  if (target <= timestamp(now)) fail('지금 이후의 시각을 골라 주세요.');
  const delta = target - instant(blocks[0], 'start');
  const moved = blocks.map(block => {
    const startAt = instant(block, 'start') + delta, endAt = instant(block, 'end') + delta;
    const local = new Date(startAt + KST).toISOString().slice(0, 10);
    const minutes = (startAt - (day(local) - KST)) / 60000;
    return { block, date: local, start: clock(minutes), end: clock(minutes + (endAt - startAt) / 60000), startAt, endAt };
  });
  if (moved.some(item => minute(item.start) + (item.endAt - item.startAt) / 60000 > 1440)) fail('하루를 넘기는 시간으로는 미룰 수 없어요.');
  if (task?.deadline && moved.at(-1).endAt > Date.parse(task.deadline)) fail('마감 시각을 넘겨서는 미룰 수 없어요.', 409);
  if (task?.notBefore && moved[0].startAt < Date.parse(task.notBefore)) fail('시작 가능 시각보다 앞으로는 옮길 수 없어요.', 409);

  const movingIds = new Set(blockIds);
  const settings = db.user?.settings ?? {};
  const rest = settings.breakMinutes ?? 0;
  for (const item of moved) {
    for (const window of blockedWindows(item.date, db.fixedBlocks, settings)) {
      if (minute(item.start) < minute(window.end) && minute(window.start) < minute(item.end)) fail('고정 일정·수면·휴식 시간과 겹쳐요.', 409);
    }
    for (const other of db.scheduledBlocks) {
      if (movingIds.has(other.id) || other.status === 'missed') continue;
      if (item.startAt < instant(other, 'end') + rest * 60000 && instant(other, 'start') < item.endAt + rest * 60000) fail('다른 작업과 겹치거나 쉬는 시간이 부족해요.', 409);
    }
  }
  for (const item of moved) {
    Object.assign(item.block, { date: item.date, start: item.start, end: item.end, status: 'planned', postponed: true });
    delete item.block.placementReason;
  }
  return { blocks: moved.map(item => item.block) };
}
