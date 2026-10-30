import { TIME_UNIT_MINUTES as STEP } from '../prompts/task-granularity.js';

const sum = subtasks => subtasks.reduce((total, item) => total + item.estimatedMinutes, 0);

/**
 * AI 추정 결과를 5분 단위로 맞춘다. 하위작업은 가장 가까운 5분으로, 범위는 하한 내림·상한 올림으로 정리한다.
 * 사용자가 말한 전체 시간(userBase)이 있으면 합계를 그 값에 맞추고, 5분 단위가 아니면 그대로 둔다.
 */
export function normalizeBreakdown(breakdown, userBase = null) {
  if (userBase !== null && userBase % STEP) return breakdown;
  const subtasks = breakdown.subtasks.map(item => ({ ...item, estimatedMinutes: Math.max(STEP, Math.round(item.estimatedMinutes / STEP) * STEP) }));
  const target = userBase ?? sum(subtasks);
  const drift = target - sum(subtasks);
  if (drift) {
    const largest = subtasks.reduce((best, item, index) => item.estimatedMinutes > subtasks[best].estimatedMinutes ? index : best, 0);
    subtasks[largest].estimatedMinutes += drift;
  }
  if (subtasks.some(item => item.estimatedMinutes < STEP || item.estimatedMinutes % STEP) || sum(subtasks) !== target) return breakdown;
  const [low, high] = breakdown.rangeMinutes;
  return { ...breakdown, subtasks, baseEstimatedMinutes: target,
    rangeMinutes: [Math.min(target, Math.max(STEP, Math.floor(low / STEP) * STEP)), Math.max(target, Math.ceil(high / STEP) * STEP)] };
}
