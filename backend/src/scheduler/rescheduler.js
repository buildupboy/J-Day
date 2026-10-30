// 재배치.
// 미완료 블록이 생기거나 새 작업이 추가되면, 지금 이후의 작업 블록을 다시 짠다.

/**
 * 현재 시각 이후의 배치를 다시 계산한다.
 * - 이미 지난 블록 / 완료된 블록은 유지
 * - 미래 블록은 비우고, 남은 작업량 기준으로 allocator.allocate 재호출
 * @param {object} db store 전체 데이터
 * @param {{ now: Date, reason: 'new_task'|'missed'|'progress'|'manual' }} options
 * @returns {{ scheduledBlocks: Array, changes: Array, unplaced: Array }}
 */
export function reschedule(db, options) {
  // TODO: 구현
  return { scheduledBlocks: db.scheduledBlocks ?? [], changes: [], unplaced: [] };
}

/**
 * 진행률과 예정 블록을 비교해 "놓친(미완료)" 블록을 찾는다.
 * @param {Array} scheduledBlocks
 * @param {Array} tasks
 * @param {Date} now
 * @returns {Array} 놓친 ScheduledBlock 목록
 */
export function detectMissedBlocks(scheduledBlocks, tasks, now) {
  // TODO: 구현
  return [];
}
