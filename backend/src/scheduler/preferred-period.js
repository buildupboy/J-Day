import { minute, clock } from './time.js';
export const PREFERRED_PERIODS = { dawn: [0, 360], morning: [360, 720], daytime: [720, 1080], evening: [1080, 1440] };

export function prioritizeSlots(slots, preferredPeriod) {
  if (preferredPeriod == null) return slots;
  const band = PREFERRED_PERIODS[preferredPeriod];
  if (!Array.isArray(band)) throw new RangeError('지원하지 않는 희망 작업 시간대입니다.');
  const pieces = slots.flatMap((slot) => {
    const left = minute(slot.start), right = minute(slot.end);
    const points = [left, ...band.filter((point) => point > left && point < right), right];
    return points.slice(0,-1).map((start,index) => ({ start: clock(start), end: clock(points[index+1]), preferred: start >= band[0] && start < band[1] }));
  });
  return pieces.sort((a,b) => Number(b.preferred)-Number(a.preferred) || a.start.localeCompare(b.start));
}
