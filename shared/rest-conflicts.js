// 매일 반복되는 휴식과 주간 고정 일정의 겹침을 화면·서버에서 동일하게 검사한다.
function intervals(period) {
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!period || !time.test(period.start) || !(time.test(period.end) || period.end === '24:00') || period.start === period.end) return [];
  if (period.start < period.end) return [{ start: period.start, end: period.end }];
  return [{ start: period.start, end: '24:00' }, ...(period.end !== '00:00' ? [{ start: '00:00', end: period.end }] : [])];
}
export function restConflictMessage(restPeriods = [], fixedBlocks = []) {
  for (const [index, period] of restPeriods.entries()) {
    for (const fixed of fixedBlocks) {
      if (!fixed.dayOfWeek?.some(day => Number.isInteger(day) && day >= 0 && day <= 6)) continue;
      if (!intervals(period).some(rest => intervals(fixed).some(block => rest.start < block.end && block.start < rest.end))) continue;
      const days = [...new Set(fixed.dayOfWeek)].filter(day => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => a - b).map(day => ['일', '월', '화', '수', '목', '금', '토'][day]).join('·');
      return '고정 쉬는 시간 ' + (index + 1) + '은 이미 등록된 ' + (fixed.title || '고정 일정') + ' (' + days + ' ' + fixed.start + '–' + fixed.end + ')과 겹쳐요. 다른 시간을 선택해 주세요.';
    }
  }
  return null;
}
