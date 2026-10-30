import { blockedWindows } from '../scheduler/blocked-windows.js';
import { availableWindows, planningSettings } from '../scheduler/planning-context.js';
import { DAY, KST, clock, day, instant, minute, timestamp } from '../scheduler/time.js';
import { fail, integer, object } from './validation.js';

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
      if (movingIds.has(other.id) || other.status === 'missed' || other.released) continue;
      if (item.startAt < instant(other, 'end') + rest * 60000 && instant(other, 'start') < item.endAt + rest * 60000) fail('다른 작업과 겹치거나 쉬는 시간이 부족해요.', 409);
    }
  }
  for (const item of moved) {
    Object.assign(item.block, { date: item.date, start: item.start, end: item.end, status: 'planned', postponed: true });
    delete item.block.placementReason;
  }
  return { blocks: moved.map(item => item.block) };
}

const kstDate = time => new Date(time + KST).toISOString().slice(0, 10);

/**
 * '오늘 남은 시간에' / '내일' 미루기. 사용자가 고른 날의 빈 시간 중 묶음 전체가 들어가는 첫 자리로 옮긴다.
 * 자리를 찾은 뒤에는 직접 고른 미루기와 같은 검사(postponeBlocks)를 거친다. 자리가 없으면 옮기지 않는다.
 */
export function postponeToFreeSlot(db, input, { now }) {
  object(input);
  if (!['today', 'tomorrow'].includes(input.when)) fail('when은 today 또는 tomorrow여야 합니다.');
  const { blockIds } = input;
  if (!Array.isArray(blockIds) || !blockIds.length || blockIds.length > 50) fail('미룰 일정을 골라 주세요.');
  const blocks = blockIds.map(id => db.scheduledBlocks?.find(block => block.id === id) ?? fail('일정을 찾을 수 없습니다.', 404))
    .sort((a, b) => instant(a, 'start') - instant(b, 'start'));
  const span = (instant(blocks.at(-1), 'end') - instant(blocks[0], 'start')) / 60000;
  const date = kstDate(timestamp(now) + (input.when === 'tomorrow' ? DAY : 0));
  const moving = new Set(blockIds);
  const occupied = (db.scheduledBlocks ?? []).filter(block => block.date === date && !moving.has(block.id) && block.status !== 'missed' && !block.released);
  const slot = availableWindows(date, db.fixedBlocks, occupied, planningSettings(db.user?.settings ?? {}), now)
    .find(window => minute(window.end) - minute(window.start) >= span && day(date) - KST + minute(window.start) * 60000 > timestamp(now));
  if (!slot) fail(input.when === 'today' ? '오늘 남은 시간에는 들어갈 빈 자리가 없어요.' : '내일은 들어갈 빈 자리가 없어요.', 409);
  return { ...postponeBlocks(db, { blockIds, date, start: slot.start }, { now }), date, start: slot.start };
}

/**
 * '시간이 더 필요해요': 하고 있는 작업 블록을 지금(또는 예정 종료) 이후로 minutes만큼 늘리고,
 * 오늘 그 뒤에 잡힌 작업 블록을 같은 만큼 민다. 밀다가 고정 일정·수면·휴식과 겹치거나 하루를 넘기는 블록은
 * 빼서 남은 작업량으로 돌린다(dropped). 호출자가 재배치를 요청해 다시 놓는다.
 */
export function extendBlock(db, input, { now }) {
  object(input);
  const minutes = integer(input.minutes, 'minutes', 5, 240);
  const block = db.scheduledBlocks?.find(item => item.id === input.blockId) ?? fail('일정을 찾을 수 없습니다.', 404);
  if (!block.taskId || block.status !== 'planned') fail('진행 중인 작업 블록만 늘릴 수 있어요.', 409);
  const time = timestamp(now);
  if (instant(block, 'start') > time) fail('아직 시작하지 않은 작업이에요.', 409);
  const originalEnd = instant(block, 'end');
  const newEnd = Math.max(originalEnd, Math.ceil(time / 60000) * 60000) + minutes * 60000;
  const midnight = day(block.date) - KST;
  if (newEnd - midnight > DAY) fail('하루를 넘겨서는 늘릴 수 없어요.', 409);
  const shift = newEnd - originalEnd;
  const settings = db.user?.settings ?? {};
  const windows = blockedWindows(block.date, db.fixedBlocks, settings);
  const shifted = [], dropped = new Set();
  const followers = db.scheduledBlocks
    .filter(item => item !== block && item.taskId && item.status === 'planned' && !item.released && item.date === block.date && instant(item, 'start') >= originalEnd)
    .sort((a, b) => instant(a, 'start') - instant(b, 'start'));
  for (const item of followers) {
    const start = (instant(item, 'start') + shift - midnight) / 60000, end = (instant(item, 'end') + shift - midnight) / 60000;
    if (end > 1440 || windows.some(window => start < minute(window.end) && minute(window.start) < end)) { dropped.add(item.id); continue; }
    Object.assign(item, { start: clock(start), end: clock(end) });
    shifted.push(item.id);
  }
  db.scheduledBlocks = db.scheduledBlocks.filter(item => !dropped.has(item.id));
  Object.assign(block, { end: clock((newEnd - midnight) / 60000), extendedMinutes: (block.extendedMinutes ?? 0) + Math.round(shift / 60000) });
  return { block, shifted, dropped: [...dropped] };
}
