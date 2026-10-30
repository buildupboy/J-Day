import { computeCorrectionFactors } from '../scheduler/estimator.js';
﻿const TYPES = ['report', 'coding', 'exam', 'presentation', 'reading', 'etc'];
export function kstDate(value) {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return validDate(value) ? value : null;
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(+date) ? null : new Date(+date + 9 * 3600000).toISOString().slice(0, 10);
}
function validDate(value) { const d = new Date(value + 'T00:00:00Z'); return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === value; }
function addDays(value, days) { const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function analysisPeriod(from, mode = 'week', now = new Date()) {
  const date = from ?? new Date(+now + 9 * 3600000).toISOString().slice(0, 10);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !validDate(date)) throw Object.assign(new Error('from은 유효한 YYYY-MM-DD 날짜여야 합니다.'), { status: 400 });
  const d = new Date(date + 'T00:00:00Z');
  const start = mode === 'month' ? date.slice(0, 7) + '-01' : addDays(date, -(d.getUTCDay() + 6) % 7);
  const end = mode === 'month' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10) : addDays(start, 7);
  return { from: start, to: addDays(end, -1), end };
}
const numeric = (value) => Number.isInteger(value) && value > 0;
const typeOf = (value) => TYPES.includes(value) ? value : 'etc';
function unique(items, key) { return [...new Map(items.map((item) => [key(item), item])).values()]; }
function blockMinutes(block) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(block.start) || !(time.test(block.end) || block.end === '24:00')) return 0;
  const minute = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return Math.max(0, minute(block.end) - minute(block.start));
}
export function analyze(db, period, now = new Date()) {
  const inside = (date) => date && date >= period.from && date < period.end;
  const tasks = unique(db.tasks || [], (task) => task.id);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  // 전체 작업 완료 기록만 사용하고 같은 작업의 중복 기록은 최신 항목으로 통합한다.
  const history = (db.history || []).filter((item) => !item.subtaskId && kstDate(item.completedAt)).sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  const completed = unique(history, (item) => item.taskId ? `task:${item.taskId}` : `legacy:${item.id || JSON.stringify([item.taskTitle, item.type, item.completedAt, item.estimatedMinutes, item.actualMinutes])}`).filter((item) => inside(kstDate(item.completedAt)));
  const blocks = unique((db.scheduledBlocks || []).filter((block) => inside(kstDate(block.date)) && !block.released), (block) => block.id || JSON.stringify([block.taskId, block.subtaskId, block.date, block.start, block.end]));
  const due = tasks.filter((task) => inside(kstDate(task.deadline)));
  const categoryMinutes = Object.fromEntries(TYPES.map((type) => [type, 0]));
  const daily = Array.from({ length: Math.round((new Date(period.end) - new Date(period.from)) / 86400000) }, (_, i) => ({ date: addDays(period.from, i), minutes: 0, completedTasks: 0, missedBlocks: 0, blocks: [] }));
  const bands = ['오전', '오후', '저녁·밤'].map((label) => ({ label, minutes: 0, done: 0, missed: 0, total: 0 }));
  // 새 추정시간 보정과 같은 계산 함수를 사용하되 통계 범위는 선택한 기간이다.
  const speedRecords = completed.filter(item => TYPES.includes(item.type) && numeric(item.actualMinutes) && numeric(item.estimatedMinutes));
  const factors = computeCorrectionFactors(speedRecords);
  const patterns = TYPES.map(type => {
    const records = speedRecords.filter(item => item.type === type);
    const correctionFactor = factors[type] ?? null;
    return { type, completedTasks: completed.filter(item => typeOf(item.type) === type).length, missedBlocks: 0,
      dueCompletedTasks: due.filter(task => typeOf(task.type) === type && task.status === 'done').length,
      incompleteTasks: due.filter(task => typeOf(task.type) === type && task.status !== 'done').length,
      validActualRecords: records.length,
      estimatedMinutes: records.reduce((sum, item) => sum + item.estimatedMinutes, 0),
      actualMinutes: records.reduce((sum, item) => sum + item.actualMinutes, 0),
      correctionFactor,
      differencePercent: correctionFactor === null ? null : Math.round((correctionFactor - 1) * 100) };
  });
  for (const block of blocks) {
    const minutes = blockMinutes(block), type = typeOf(taskMap.get(block.taskId)?.type);
    categoryMinutes[type] += minutes;
    const day = daily.find((item) => item.date === block.date);
    day.minutes += minutes; day.missedBlocks += Number(block.status === 'missed');
    day.blocks.push({ id: block.id, title: taskMap.get(block.taskId)?.title || '연결된 작업 없음', start: block.start, end: block.end, status: block.status, type });
    const hour = Number(block.start?.slice(0, 2));
    const band = bands[hour >= 6 && hour < 12 ? 0 : hour >= 12 && hour < 18 ? 1 : 2];
    band.minutes += minutes; band.total++; band.done += Number(block.status === 'done'); band.missed += Number(block.status === 'missed');
    patterns.find((item) => item.type === type).missedBlocks += Number(block.status === 'missed');
  }
  for (const record of completed) daily.find((day) => day.date === kstDate(record.completedAt)).completedTasks++;
  const missed = blocks.filter((block) => block.status === 'missed');
  const scheduledMinutes = Object.values(categoryMinutes).reduce((a, b) => a + b, 0);
  const suggestions = [];
  if (missed.length) suggestions.push(`완료 확인이 되지 않은 블록이 ${missed.length}개 있어요. 다음 계획의 작업량과 여유 시간을 점검해 보세요.`);
  const largest = Object.entries(categoryMinutes).sort((a, b) => b[1] - a[1])[0];
  if (scheduledMinutes) suggestions.push(`현재 계획 시간의 ${Math.round(largest[1] / scheduledMinutes * 100)}%가 ${ {report:'보고서',coding:'코딩',exam:'시험',presentation:'발표',reading:'읽기',etc:'기타'}[largest[0]]}에 배치되어 있어요.`);
  if (!suggestions.length) suggestions.push('이 기간의 배치·완료 기록이 쌓이면 계획을 돌아볼 수 있어요.');
  return { ...period, timezone: 'Asia/Seoul', completedTasks: completed.length, scheduledMinutes, categoryMinutes, daily, bands, patterns,
    dueTasks: { total: due.length, completed: due.filter((task) => task.status === 'done').length, items: due.map((task) => ({ id: task.id, title: task.title, deadline: task.deadline, status: task.status })) },
    missedBlocks: missed.length, missedTasks: new Set(missed.map((block) => block.taskId).filter(Boolean)).size,
    overdueTasks: due.filter((task) => task.status !== 'done' && new Date(task.deadline.length === 10 ? task.deadline + 'T23:59:59+09:00' : task.deadline) < now).length,
    capabilities: { correction: true, settingsWrite: true, goals: false, progressHistory: false },
    profile: { name: db.user?.name || '사용자', settings: db.user?.settings || {} }, suggestions,
    notes: ['현재 저장된 배치 기준이며 재배치로 삭제된 과거 계획은 포함하지 않아요.', '계획 시간은 실제 작업시간이 아니에요. missed는 완료 미확인 상태이며 작업을 전혀 하지 않았다는 의미가 아니에요.', '작업 속도는 선택한 기간의 완료 기록에서 예상 시간 합계와 실제 시간 합계를 비교해요. 새 작업의 추정시간 보정에는 전체 유효 수행 기록을 사용하므로 기간별 분석과 다를 수 있어요.'] };
}
