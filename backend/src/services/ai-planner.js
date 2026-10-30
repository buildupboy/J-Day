import { complete } from './llm.js';
import { PLANNING_SYSTEM_PROMPT } from '../prompts/planning.js';
import { AI_PLAN_SCHEMA } from '../scheduler/ai-plan-schema.js';
import { reschedule } from '../scheduler/rescheduler.js';
import { acceptAiPlan } from '../scheduler/ai-plan.js';
import { assertSchema } from './voice-validation.js';

// 서버 검증용 전체 문맥은 보존하고 모델에는 중복 설명과 범위 밖 기록을 줄여 전달한다.
export function planningModelInput(context) {
  const { sourceRevision, schemaVersion, priorityPolicy, planningInstructions, ...input } = context;
  const slimBlock = ({ id, taskId, subtaskId, date, start, end, status, continuationOf, breakAfterMinutes }) => ({ id, taskId, subtaskId, date, start, end, status, continuationOf, breakAfterMinutes });
  return { ...input,
    protectedBlocks: context.protectedBlocks.filter(block => block.date >= context.window.from && block.date <= context.window.to).map(slimBlock),
    existingFutureBlocks: (context.existingFutureBlocks ?? []).map(slimBlock) };
}

/** 공식 입력 준비 → AI → 공식 검증/적용. 호출자의 updateDb 트랜잭션에서 실행한다. */
export function createAiPlanner({ completeFn = complete, clock = () => new Date() } = {}) {
  return async function planSchedule(db, options) {
    let prepared = reschedule(db, options);
    let candidate = { ...db, scheduledBlocks: prepared.scheduledBlocks,
      aiScheduling: { status: 'pending', context: prepared.planningContext } };
    let messages = [{ role: 'user', content: JSON.stringify(planningModelInput(prepared.planningContext)) }];
    let best, bestPlan;
    const commit = result => {
      Object.assign(db, { scheduledBlocks: result.scheduledBlocks, aiScheduling: result.aiScheduling });
      if (db.schedulerRequests) db.schedulerRequests = db.schedulerRequests.map(request => request.status === 'pending'
        ? { ...request, status: 'processed', processedAt: clock().toISOString() } : request);
      const { aiScheduling, ...response } = result;
      return { ...response, planning: { engine: 'ai' } };
    };
    const finishBest = () => commit(acceptAiPlan(candidate, bestPlan, { now: clock() }));
    const better = (a, b, tasks) => {
      for (const task of tasks) {
        const left = a.unplaced.find(u => u.taskId === task.taskId)?.remainingMinutes ?? 0;
        const right = b.unplaced.find(u => u.taskId === task.taskId)?.remainingMinutes ?? 0;
        if (left !== right) return left < right;
      }
      return false;
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const context = candidate.aiScheduling.context;
      let content;
      try {
        if (!context.rankedTasks.length) content = JSON.stringify({ contextId: context.contextId, blocks: [] });
        else content = await completeFn({ system: PLANNING_SYSTEM_PROMPT, schema: AI_PLAN_SCHEMA, name: 'schedule_plan', messages });
      } catch (error) {
        if (best) return finishBest();
        throw error;
      }
      try {
        const plan = JSON.parse(content);
        if (!Array.isArray(plan.blocks) || plan.blocks.length > 1000) throw new Error('blocks는 최대 1000개 배열이어야 합니다.');
        assertSchema({ ...plan, blocks: [] }, AI_PLAN_SCHEMA);
        for (const block of plan.blocks) assertSchema(block, AI_PLAN_SCHEMA.properties.blocks.items);
        // 응답을 받은 실제 시각으로 검증한다. 시각을 자동으로 옮기지 않는다.
        const result = acceptAiPlan(candidate, plan, { now: clock() });
        if (!best || better(result, best, context.rankedTasks)) { best = result; bestPlan = plan; }
        if (attempt === 0 && result.unplaced.length) {
          messages.push({ role: 'assistant', content }, { role: 'user', content: JSON.stringify({
            reviewUnplaced: result.unplaced, currentTime: clock().toISOString(),
            instruction: '잔량이 남았습니다. 전체 기간의 빈 구간과 하루 한도를 다시 검토하세요. 선호 시간대는 절대 제한이 아닙니다. 다른 시간대·다음 날도 사용하고, 선행 작업과 휴식을 지키며 충분한 시간이 있는 작업은 마감 전에 모두 배치하세요. 불가능한 분량만 남기고 같은 contextId로 전체 계획을 다시 반환하세요.' }) });
          continue;
        }
        return finishBest();
      } catch (error) {
        if (attempt === 1) {
          if (best) {
            // 재검토 제안이 잘못됐으면 최초의 검증된 결과를 현재 시각으로 다시 확인한다.
            return finishBest();
          }
          throw Object.assign(new Error(`AI 일정이 조건을 충족하지 못했어요. 기존 일정은 유지됩니다. ${error.message}`), { status: 502 });
        }
        if (error.status === 409) {
          prepared = reschedule(db, { ...options, now: clock() });
          candidate = { ...db, scheduledBlocks: prepared.scheduledBlocks,
            aiScheduling: { status: 'pending', context: prepared.planningContext } };
          messages = [{ role: 'user', content: JSON.stringify({ ...planningModelInput(prepared.planningContext), validationErrors: [error.message] }) }];
        } else messages.push({ role: 'assistant', content }, { role: 'user', content: JSON.stringify({
          validationErrors: [error.message], currentTime: clock().toISOString(), instruction: '현재 시각과 모든 조건을 확인하고 같은 contextId로 전체 계획을 다시 반환하세요.' }) });
      }
    }
  };
}
export const planSchedule = createAiPlanner();
