const types = new Set(['report', 'coding', 'exam', 'presentation', 'reading', 'etc']);

/** 유형별 실제 시간 합 / 기본 추정시간 합. 유효하지 않은 기록은 제외한다. */
export function computeCorrectionFactors(history) {
  if (!Array.isArray(history)) throw new TypeError('history는 배열이어야 합니다.');
  const totals = new Map();
  for (const record of history) {
    if (!record || !types.has(record.type) || !Number.isInteger(record.estimatedMinutes) || record.estimatedMinutes <= 0
      || !Number.isInteger(record.actualMinutes) || record.actualMinutes <= 0) continue;
    const total = totals.get(record.type) ?? { estimated: 0, actual: 0 };
    total.estimated += record.estimatedMinutes;
    total.actual += record.actualMinutes;
    totals.set(record.type, total);
  }
  return Object.fromEntries([...totals].map(([type, total]) => [type, total.actual / total.estimated]));
}

/** 원본 추정시간에 한 번만 적용한다. 보정이 있으면 5분 단위로 올림해 작업량 손실을 피한다. */
export function applyCorrection(baseMinutes, type, factors) {
  if (!Number.isInteger(baseMinutes) || baseMinutes < 0 || !types.has(type)) throw new RangeError('기본 시간과 과제 유형을 확인하세요.');
  const factor = Object.hasOwn(factors, type) ? factors[type] : 1;
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError('보정 계수는 양수여야 합니다.');
  const result = factor === 1 ? baseMinutes : Math.ceil(baseMinutes * factor / 5) * 5;
  if (!Number.isSafeInteger(result)) throw new RangeError('보정 시간이 너무 큽니다.');
  return result;
}
