import { createHash, randomUUID } from 'node:crypto';
import { clock, minute, instant, kstMinutes, kstIso, appliesOn, day } from '../scheduler/time.js';
import { fixedWithEvents } from '../scheduler/fixed.js';
import { reportProgress } from './task-service.js';
import { replan } from './planner.js';
import { fail, object } from './validation.js';

const extensions = [15, 30, 60];

function blockById(db, id) {
  const block = (db.scheduledBlocks ?? []).find(block => block.id === id);
  if (!block) fail('작업 블록을 찾을 수 없습니다.', 404);
  return block;
}
const version = blocks => createHash('sha1').update(JSON.stringify(blocks ?? [])).digest('hex');
const titleOf = (db, block) => {
  const task = db.tasks.find(task => task.id === block.taskId);
  return task?.subtasks?.find(subtask => subtask.id === block.subtaskId)?.title ?? task?.title ?? block.taskId;
};

/** 재배치 전후 비교를 화면용 변경 목록으로 바꾼다. 제외한 블록은 목록에서 뺀다. */
export function describeChanges(db, changes, exceptId) {
  return changes.filter(change => (change.after ?? change.before).id !== exceptId).map(change => {
    const before = change.before, after = change.after;
    return { title: titleOf(db, after ?? before), type: change.type,
      from: before ? `${before.date === (after ?? before).date ? '' : `${before.date} `}${before.start}` : null,
      to: after ? `${after.date === (before ?? after).date ? '' : `${after.date} `}${after.start}` : null };
  }).filter(change => change.from !== change.to);
}

export function startBlock(db, id, { now }) {
  const block = blockById(db, id);
  if (block.endedAt) fail('이미 끝난 블록입니다.', 409);
  if (block.status !== 'planned') fail('예정된 블록만 시작할 수 있습니다.', 409);
  block.startedAt ??= kstIso(now);
  const task = db.tasks.find(task => task.id === block.taskId);
  if (task?.status === 'todo') task.status = 'in_progress';
  return { block };
}

/**
 * 블록을 지금 끝낸다. 일찍 끝났으면 블록 길이를 줄여 남는 시간을 비우고,
 * 계획한 분량을 끝낸 것으로 보고 작업 진행률을 올린 뒤 재배치한다.
 */
export function endBlock(db, id, input, { now }) {
  const block = blockById(db, id);
  if (block.endedAt) fail('이미 끝난 블록입니다.', 409);
  const task = db.tasks.find(task => task.id === block.taskId);
  if (!task) fail('작업을 찾을 수 없습니다.', 404);
  const body = input === undefined ? {} : object(input);
  const plannedMin = minute(block.end) - minute(block.start);
  const endTime = instant(block, 'end'), startTime = instant(block, 'start');
  if (startTime >= now.getTime()) fail('아직 시작하지 않은 블록은 끝낼 수 없습니다.');
  const earlyMin = Math.max(0, Math.round((endTime - now.getTime()) / 60000));
  const startedAt = block.startedAt ? Date.parse(block.startedAt) : startTime;
  const workedMin = Math.max(0, Math.min(plannedMin, Math.round((now.getTime() - startedAt) / 60000)));
  const originalEnd = block.end;
  if (earlyMin > 0) block.end = clock(Math.max(minute(block.start) + 1, kstMinutes(now) + (now.getUTCSeconds() > 0 ? 1 : 0)));
  const report = { blockId: block.id, blockStatus: 'done', actualMinutes: (task.actualMinutes ?? 0) + workedMin };
  if (body.progress !== undefined) report.progress = Math.max(task.progress, body.progress);
  else if (task.estimatedMinutes > 0) report.progress = Math.min(1, Math.max(task.progress, task.progress + plannedMin / task.estimatedMinutes));
  if (body.subtaskDone === true && block.subtaskId) { report.subtaskId = block.subtaskId; report.subtaskDone = true; }
  const result = reportProgress(db, task.id, report, { now });
  // 재배치가 블록 객체를 새로 만들므로 다시 찾아서 기록한다.
  const ended = blockById(db, id);
  ended.endedAt = kstIso(now);
  if (earlyMin > 0) ended.originalEnd = originalEnd;
  return { block: ended, earlyMin, workedMin, ...result };
}

/** 끝난 뒤 남은 시간: 쉬기는 휴식 일정으로 막고, 당기기는 다음 작업을 앞으로 배치한다. */
export function afterEnd(db, id, input, { now }) {
  const block = blockById(db, id);
  object(input);
  if (!block.endedAt) fail('끝나지 않은 블록입니다.', 409);
  if (input.action === 'rest') {
    const freeFrom = block.end, freeTo = block.originalEnd ?? block.end;
    if (minute(freeFrom) < minute(freeTo)) {
      db.events ??= [];
      db.events.push({ id: randomUUID(), title: '휴식', date: block.date, start: freeFrom, end: freeTo, category: 'rest', auto: true });
    }
  } else if (input.action !== 'pull_next') fail('action은 rest 또는 pull_next여야 합니다.');
  return { action: input.action, ...replan(db, now) };
}

/** 진행 중 블록을 늘렸을 때 뒤 일정이 어떻게 밀리는지 미리 계산해 제안으로 저장한다. */
export function extendBlock(db, id, input, { now }) {
  const block = blockById(db, id);
  object(input);
  if (!extensions.includes(input.minutes)) fail('minutes는 15, 30, 60 중 하나여야 합니다.');
  if (block.endedAt) fail('이미 끝난 블록은 연장할 수 없습니다.', 409);
  if (instant(block, 'start') >= now.getTime()) fail('아직 시작하지 않은 블록은 연장할 수 없습니다.');
  const end = minute(block.end) + input.minutes;
  if (end > 1440) fail('자정을 넘겨 연장할 수 없습니다.');
  const weekday = new Date(day(block.date)).getUTCDay();
  const clash = fixedWithEvents(db).find(fixed => appliesOn(fixed, block.date, weekday)
    && minute(fixed.start) < end && minute(block.end) < minute(fixed.end));
  if (clash) fail(`'${clash.title}' 일정(${clash.start})과 겹쳐서 연장할 수 없어요.`, 409);
  const draft = structuredClone(db);
  const target = draft.scheduledBlocks.find(candidate => candidate.id === id);
  target.end = clock(end);
  const { changes } = replan(draft, now);
  const moved = describeChanges(db, changes, id)
    .filter(change => change.from !== null && change.to !== null);
  const message = moved.length
    ? `${moved[0].title}을(를) ${moved[0].to}로 미룰게요${moved.length > 1 ? ` 외 ${moved.length - 1}건` : ''}`
    : `${input.minutes}분 연장해도 다른 일정은 그대로예요`;
  const proposal = saveProposal(db, { kind: 'extend', blockId: id, message, changes: moved, afterBlocks: draft.scheduledBlocks, now });
  return { proposalId: proposal.id, message, changes: moved };
}

export function saveProposal(db, { kind, message, changes, afterBlocks, now, blockId }) {
  db.proposals ??= [];
  const proposal = { id: `p_${randomUUID().slice(0, 8)}`, kind, message, changes, afterBlocks, baseVersion: version(db.scheduledBlocks),
    createdAt: now.toISOString(), ...(blockId ? { blockId } : {}) };
  db.proposals = [...db.proposals.slice(-19), proposal];
  return proposal;
}

function proposalById(db, id) {
  const proposal = (db.proposals ?? []).find(proposal => proposal.id === id);
  if (!proposal) fail('제안을 찾을 수 없습니다.', 404);
  return proposal;
}
export function getProposal(db, id) {
  const { afterBlocks, baseVersion, ...view } = proposalById(db, id);
  return { ...view, stale: baseVersion !== version(db.scheduledBlocks) };
}
export function acceptProposal(db, id) {
  const proposal = proposalById(db, id);
  if (proposal.baseVersion !== version(db.scheduledBlocks)) {
    db.proposals = db.proposals.filter(candidate => candidate !== proposal);
    fail('그 사이 일정이 바뀌어 제안이 만료됐어요. 다시 요청해 주세요.', 409);
  }
  db.scheduledBlocks = proposal.afterBlocks;
  db.proposals = db.proposals.filter(candidate => candidate !== proposal);
  return { accepted: true, id, changes: proposal.changes };
}
export function rejectProposal(db, id) {
  const proposal = proposalById(db, id);
  db.proposals = db.proposals.filter(candidate => candidate !== proposal);
  return { rejected: true, id };
}
export { version as scheduleVersion };
