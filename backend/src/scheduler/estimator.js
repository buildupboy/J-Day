// 개인 보정 계수 기반 작업량 추정.
// LLM이 준 "일반적인" 추정시간에, 이 사용자의 과거 수행 기록으로 계산한 보정 계수를 곱한다.

/**
 * 과제 유형별 개인 보정 계수를 계산한다.
 * 계수 = 실제 소요시간 합 / 추정시간 합 (기록이 없으면 1.0)
 * @param {Array<{ type: string, estimatedMinutes: number, actualMinutes: number }>} history
 * @returns {Record<string, number>} 예: { report: 1.4, coding: 1.1 }
 */
export function computeCorrectionFactors(history) {
  // TODO: 유형별 그룹핑, 이상치 처리, 최근 기록 가중치 등
  return {};
}

/**
 * 기본 추정시간에 개인 보정 계수를 적용한다.
 * @param {number} baseMinutes LLM이 추정한 기본 소요시간
 * @param {string} type 과제 유형
 * @param {Record<string, number>} factors computeCorrectionFactors 결과
 * @returns {number} 보정된 추정시간(분)
 */
export function applyCorrection(baseMinutes, type, factors) {
  // TODO: 반올림 단위(예: 10분) 정하기
  return Math.round(baseMinutes * (factors[type] ?? 1));
}
