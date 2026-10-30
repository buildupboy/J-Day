import { date, fail } from './voice-validation.js';

export function unavailableDates(db) {
  const dates = db.schedulingConstraints?.unavailableDates ?? [];
  if (!Array.isArray(dates) || dates.length > 366) fail('휴무 날짜는 최대 366개입니다.');
  return [...new Set(dates.map(date))].sort();
}

/** 일회성 날짜 제약만 갱신한다. 과제·고정 일정·완료 기록을 삭제하지 않는다. */
export function updateAvailability(db, { unavailableDates: requested, availabilityAction }, now) {
  if (requested == null && availabilityAction == null) return null;
  if (!Array.isArray(requested) || !requested.length || requested.length > 31) fail('변경할 휴무 날짜는 1~31개여야 합니다.');
  if (!['block', 'unblock'].includes(availabilityAction)) fail('휴무 설정 또는 해제 여부를 확인해 주세요.');
  const dates = [...new Set(requested.map(date))].sort();
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0,10);
  if (dates.some(value => value < today)) fail('지난 날짜의 일정은 휴무 요청으로 변경하지 않아요.');
  if (dates.some(value => Date.parse(value) - Date.parse(today) > 30 * 86400000)) fail('휴무 변경은 앞으로 31일 이내 날짜를 지정해 주세요.');
  const next = new Set(unavailableDates(db));
  dates.forEach(value => availabilityAction === 'block' ? next.add(value) : next.delete(value));
  const values = [...next].filter(value => value >= today).sort();
  if (values.length > 366) fail('휴무 날짜는 최대 366개입니다.');
  db.schedulingConstraints = { ...db.schedulingConstraints, unavailableDates: values };
  return { dates, action: availabilityAction };
}

export function availabilityReply(change, scheduling, db, now) {
  const labels = change.dates.map(value => new Date(`${value}T00:00:00Z`).toLocaleDateString('ko-KR', {timeZone:'UTC',month:'long',day:'numeric',weekday:'short'})).join(', ');
  if (!scheduling.rescheduled) return `${labels} ${change.action === 'block' ? '휴무 요청' : '휴무 해제 요청'}을 저장했어요. 일정 조정은 아직 대기 중이에요.`;
  let reply = change.action === 'block'
    ? `알겠어요. ${labels}에는 새 작업을 넣지 않도록 일정을 조정했어요.`
    : `알겠어요. ${labels}에도 작업을 배치할 수 있도록 일정을 조정했어요.`;
  if (change.action === 'block') {
    const fixed = db.fixedBlocks.some(block => change.dates.some(value => block.dayOfWeek.includes(new Date(`${value}T00:00:00Z`).getUTCDay())));
    if (fixed) reply += ' 수업·알바·루틴 같은 고정 일정은 그대로 유지했어요.';
    const protectedWork = (db.scheduledBlocks ?? []).some(block => change.dates.includes(block.date) && (block.status !== 'planned' || new Date(`${block.date}T${block.start}:00+09:00`).getTime() < now.getTime()));
    if (protectedWork) reply += ' 이미 시작한 작업과 지난 기록도 유지했어요.';
  }
  if (scheduling.unplaced?.length) reply += ' 마감 전에 모두 옮기지 못한 작업이 있어요. 남은 작업량도 확인해 주세요.';
  if (change.action === 'block') reply += change.dates.some(value => [0,6].includes(new Date(`${value}T00:00:00Z`).getUTCDay())) ? ' 편안한 주말 보내세요!' : ' 편히 쉬세요!';
  return reply;
}
