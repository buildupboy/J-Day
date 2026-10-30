import { minute, datetime, timestamp } from './time.js';

/** 배치 이유는 AI 제공 값과 저장 상태를 설명한다. 규칙이 시각을 결정했다고 표현하지 않는다. */
export function explainSchedule(tasks, result, { now } = {}) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const time = now === undefined ? undefined : timestamp(now);
  return {
    schedulingStatus: result.schedulingStatus ?? null,
    blocks: (result.blocks ?? result.scheduledBlocks ?? []).map(block => {
      const task = byId.get(block.taskId), subtask = task?.subtasks?.find(subtask => subtask.id === block.subtaskId);
      const minutes = minute(block.end) - minute(block.start);
      const reasons = block.status !== 'planned' ? [`${block.status === 'done' ? '완료' : '미수행'} 기록을 보존합니다.`]
        : block.source === 'ai' ? [block.placementReason ?? 'AI가 제안한 시각이며 저장 전 일정 제약을 검증했습니다.']
          : ['기존 예정 블록입니다. AI 배치 결과가 검증되기 전까지 보존합니다.'];
      return { blockId:block.id, taskId:block.taskId, title:subtask?.title ?? task?.title ?? block.taskId,
        estimatedMinutes:minutes, deadline:task?.deadline, importance:task?.importance ?? 2, reasons,
        message:`${subtask?.title ?? task?.title ?? block.taskId}: ${block.date} ${block.start}~${block.end}, ${minutes}분` };
    }),
    unplaced:(result.unplaced ?? []).map(entry => ({ ...entry,
      code:time !== undefined && byId.has(entry.taskId) && datetime(byId.get(entry.taskId).deadline) <= time ? 'deadline_passed' : 'not_in_ai_plan',
      message:'AI 배치 결과에 포함되지 않은 남은 작업시간입니다.' })),
  };
}
