const DAY = 86400000;
const KST = 9 * 60 * 60000;

function minute(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) {
    throw new RangeError('시간은 HH:mm 형식이어야 합니다.');
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function clock(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function day(value) {
  const result = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) {
    throw new RangeError('유효한 YYYY-MM-DD 날짜가 필요합니다.');
  }
  return result;
}

function positive(value, name, minimum = 1) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${name} 설정이 올바르지 않습니다.`);
  return value;
}

function bounds(settings) {
  const start = minute(settings.dayStart);
  const end = minute(settings.dayEnd);
  if (start >= end) throw new RangeError('dayStart는 dayEnd보다 빨라야 합니다.');
  positive(settings.minSlotMinutes, 'minSlotMinutes');
  return [start, end];
}

/** 특정 날짜의 고정 일정과 기존 블록을 제외한 HH:mm 빈 구간 목록. */
export function findFreeSlots(date, fixedBlocks, scheduledBlocks, settings) {
  const weekday = new Date(day(date)).getUTCDay();
  const [start, end] = bounds(settings);
  const occupied = [
    ...fixedBlocks.filter(block => block.dayOfWeek.includes(weekday)),
    ...scheduledBlocks.filter(block => block.date === date),
  ].map(block => {
    const left = minute(block.start);
    const right = minute(block.end);
    if (left >= right) throw new RangeError('블록 종료는 시작보다 늦어야 합니다.');
    return [Math.max(start, left), Math.min(end, right)];
  }).filter(([left, right]) => left < right).sort((a, b) => a[0] - b[0]);
  const slots = [];
  let cursor = start;
  for (const [left, right] of [...occupied, [end, end]]) {
    if (left - cursor >= settings.minSlotMinutes) slots.push({ start: clock(cursor), end: clock(left) });
    cursor = Math.max(cursor, right);
  }
  return slots;
}

/**
 * 마감 임박, 중요도 높은 순, 남은 작업량 큰 순으로 작업 단위 배치. 입력은 변경하지 않는다.
 * from/to는 양 끝을 포함하는 YYYY-MM-DD 날짜이다.
 * @returns {{ blocks: Array, unplaced: Array<{taskId: string, remainingMinutes: number}> }}
 */
export function allocate(tasks, fixedBlocks, { from, to, settings, existingBlocks = [] }) {
  const first = day(from);
  const last = day(to);
  if (first > last) throw new RangeError('from은 to보다 늦을 수 없습니다.');
  bounds(settings);
  const max = positive(settings.maxBlockMinutes, 'maxBlockMinutes');
  const rest = positive(settings.breakMinutes, 'breakMinutes', 0);
  const dailyLimit = settings.maxDailyMinutes === undefined ? 1440 : positive(settings.maxDailyMinutes, 'maxDailyMinutes', 0);
  const buffer = settings.bufferMinutes === undefined ? 0 : positive(settings.bufferMinutes, 'bufferMinutes', 0);
  if (dailyLimit > 1440 || buffer > 1440) throw new RangeError('하루 작업량과 여유 시간은 1440분 이하여야 합니다.');
  if (max < settings.minSlotMinutes) throw new RangeError('maxBlockMinutes는 minSlotMinutes 이상이어야 합니다.');
  const pending = tasks.filter(task => task.status !== 'done').map(task => {
    const importance = task.importance === undefined ? 2 : task.importance;
    if (!Number.isInteger(importance) || importance < 1 || importance > 3) throw new RangeError('importance는 1, 2, 3 중 하나여야 합니다.');
    positive(task.estimatedMinutes, 'estimatedMinutes', 0);
    if (!Number.isFinite(task.progress) || task.progress < 0 || task.progress > 1) throw new RangeError('progress는 0~1이어야 합니다.');
    const deadline = Date.parse(task.deadline);
    if (!Number.isFinite(deadline) || !/(Z|[+-]\d{2}:\d{2})$/.test(task.deadline)) throw new RangeError('deadline에는 시간대가 필요합니다.');
    // 완료 시간은 progress에 이미 반영되므로 planned만 남은 작업량에서 뺀다.
    const reserved = existingBlocks.filter(block => block.taskId === task.id && block.status === 'planned')
      .reduce((sum, block) => {
        const length = minute(block.end) - minute(block.start);
        if (length <= 0) throw new RangeError('기존 블록 시간이 올바르지 않습니다.');
        return sum + length;
      }, 0);
    return { task, deadline, importance, remaining: Math.max(0, Math.ceil(task.estimatedMinutes * (1 - task.progress)) - reserved) };
  }).sort((a, b) => a.deadline - b.deadline || b.importance - a.importance || b.remaining - a.remaining);
  const blocks = [];
  const usedIds = new Set(existingBlocks.map(block => block.id));
  // 기존 작업 전후에도 휴식을 확보한다. 고정 일정에는 별도 휴식을 붙이지 않는다.
  const occupied = existingBlocks.map(block => ({ ...block,
    start: clock(Math.max(0, minute(block.start) - rest)),
    end: clock(Math.min(1440, minute(block.end) + rest)),
  }));
  const dailyUsed = new Map();
  for (const block of existingBlocks) {
    if (block.status === 'planned' || block.status === 'done') {
      dailyUsed.set(block.date, (dailyUsed.get(block.date) ?? 0) + minute(block.end) - minute(block.start));
    }
  }
  // 여유 시간은 하루의 늦은 빈 구간부터 확보한다. 반환되는 작업 블록에는 넣지 않는다.
  // 작업마다 다시 계산하면 여유 시간이 계속 이동하므로 날짜별 한 번만 계산한다.
  const bufferedDates = new Set();
  for (const item of pending) {
    for (let stamp = first; stamp <= last && item.remaining > 0 && stamp - KST < item.deadline; stamp += DAY) {
      const date = new Date(stamp).toISOString().slice(0, 10);
      const cutoff = Math.min(1440, Math.floor((item.deadline - (stamp - KST)) / 60000));
      if (!bufferedDates.has(date)) {
        bufferedDates.add(date);
        let remainingBuffer = buffer;
        if (remainingBuffer > 0) {
          const free = findFreeSlots(date, fixedBlocks, occupied, { ...settings, minSlotMinutes: 1 });
          for (const slot of free.reverse()) {
            const end = minute(slot.end);
            const length = Math.min(remainingBuffer, end - minute(slot.start));
            if (length === 0) break;
            occupied.push({ date, start: clock(end - length), end: clock(end) });
            remainingBuffer -= length;
          }
        }
      }
      for (const slot of findFreeSlots(date, fixedBlocks, occupied, settings)) {
        let cursor = minute(slot.start);
        const end = Math.min(minute(slot.end), cutoff);
        while (item.remaining > 0 && end - cursor >= settings.minSlotMinutes && (dailyUsed.get(date) ?? 0) < dailyLimit) {
          const length = Math.min(max, item.remaining, end - cursor, dailyLimit - (dailyUsed.get(date) ?? 0));
          const base = `sb-${item.task.id}-${date}-${cursor}`;
          let id = base;
          for (let suffix = 1; usedIds.has(id); suffix++) id = `${base}-${suffix}`;
          usedIds.add(id);
          const block = { id, taskId: item.task.id, date, start: clock(cursor), end: clock(cursor + length), status: 'planned' };
          blocks.push(block);
          occupied.push({ ...block, start: clock(Math.max(0, cursor - rest)), end: clock(Math.min(1440, cursor + length + rest)) });
          dailyUsed.set(date, (dailyUsed.get(date) ?? 0) + length);
          item.remaining -= length;
          cursor += length + rest;
        }
      }
    }
  }
  blocks.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return { blocks, unplaced: pending.filter(item => item.remaining > 0).map(item => ({ taskId: item.task.id, remainingMinutes: item.remaining })) };
}
