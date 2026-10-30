// 빈 시간 배치 (규칙 기반, LLM 사용하지 않음).
// 고정 일정(수업·알바·루틴) 사이 빈 시간을 찾아 작업 블록을 채워 넣는다.

/**
 * 특정 날짜의 빈 시간 구간을 계산한다.
 * @param {string} date 'YYYY-MM-DD'
 * @param {Array} fixedBlocks FixedBlock[] (docs/api.md)
 * @param {Array} scheduledBlocks 이미 배치된 ScheduledBlock[]
 * @param {{ dayStart: string, dayEnd: string, minSlotMinutes: number }} settings
 * @returns {Array<{ start: string, end: string }>} 'HH:mm' 구간 목록
 */
export function findFreeSlots(date, fixedBlocks, scheduledBlocks, settings) {
  // TODO: 하루 범위에서 고정 일정·기존 블록을 빼고, minSlotMinutes 미만 구간은 버린다
  return [];
}

/**
 * 작업들을 빈 시간에 배치한다.
 * 우선순위: 마감 임박 > 남은 작업량 큰 순. 마감 이후에는 배치하지 않는다.
 * @param {Array} tasks Task[] (status !== 'done')
 * @param {Array} fixedBlocks FixedBlock[]
 * @param {{ from: string, to: string, settings: object, existingBlocks?: Array }} options
 * @returns {{ blocks: Array, unplaced: Array<{ taskId: string, remainingMinutes: number }> }}
 */
export function allocate(tasks, fixedBlocks, options) {
  // TODO: 날짜 순회 → findFreeSlots → 남은 시간만큼 블록 생성 (최대 블록 길이·휴식 고려)
  return { blocks: [], unplaced: [] };
}
