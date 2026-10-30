import { minute, datetime, timestamp } from './time.js';

/** 배치 결과를 바꾸지 않고 화면/LLM에 전달할 설명을 만든다. 추정 원인을 단정하지 않는다. */
export function explainSchedule(tasks, result, { settings, now } = {}) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const time = now === undefined ? undefined : timestamp(now);
  const blocks = result.blocks ?? result.scheduledBlocks ?? [];
  return {
    blocks: blocks.map(block => {
      const task = byId.get(block.taskId);
      const subtask = task?.subtasks?.find(subtask => subtask.id === block.subtaskId);
      const minutes = minute(block.end) - minute(block.start);
      const reasons = block.status === 'planned'
        ? ['마감 시각 → 중요도 → 남은 작업량 순서로 우선순위를 정합니다.', '고정 일정·기존 블록·휴식 시간을 피해서 배치합니다.']
        : [`${block.status === 'done' ? '완료' : '미수행'} 기록을 보존합니다.`];
      if (subtask) reasons.push('하위작업의 완료 여부와 입력 순서를 반영합니다.');
      if (task?.reviewOf) reasons.push('시험 전 지정된 복습 날짜에 배치합니다.');
      if (settings?.distribution === 'balanced') reasons.push('날짜별 분산을 우선하되, 미배치량이 늘어나면 이른 배치를 선택할 수 있습니다.');
      return { blockId: block.id, taskId: block.taskId, title: subtask?.title ?? task?.title ?? block.taskId,
        estimatedMinutes: minutes, deadline: task?.deadline, importance: task?.importance ?? 2, reasons,
        message: `${subtask?.title ?? task?.title ?? block.taskId}: ${block.date} ${block.start}~${block.end}, ${minutes}분` };
    }),
    unplaced: (result.unplaced ?? []).map(entry => {
      const task = byId.get(entry.taskId);
      const expired = time !== undefined && task && datetime(task.deadline) <= time;
      return { ...entry, code: expired ? 'deadline_passed' : 'constraints_prevent_placement',
        message: expired ? '마감이 지나 남은 작업을 배치하지 못했습니다.'
          : '배치 범위와 마감, 빈 시간, 최소 구간, 하루 작업량 한도, 여유 시간, 하위작업 순서 조건 안에서 배치하지 못했습니다.' };
    }),
  };
}
