import { timestamp } from './time.js';

// 하루에 현실적으로 쓸 수 있는 작업 분. 마감까지 남은 날수와 곱해 "쓸 수 있는 시간"을 근사한다.
const WORKABLE_MINUTES_PER_DAY = 480;
const HOUR = 3_600_000;

/**
 * 우선 배치 점수(0~100). 순서를 정하는 참고값이며 시각을 만들지 않는다.
 * - urgency: 마감까지 시간이 짧을수록 큼
 * - pressure: 남은 작업량이 마감까지 쓸 수 있는 시간에서 차지하는 비율(작업이 클수록 큼)
 * - importance: 중요도 1~3
 * - shortness: 남은 작업이 짧을수록 큼(동순위 보조)
 * 마감이 지난 작업은 항상 100이다.
 * @param {{importance:number, deadline:string, remainingMinutes:number, now:Date|string|number}} task
 */
export function schedulingWeight({ importance, deadline, remainingMinutes, now }) {
  const deadlineMs = Date.parse(deadline), nowMs = timestamp(now);
  if (![1, 2, 3].includes(importance) || !Number.isFinite(deadlineMs) || !Number.isFinite(remainingMinutes) || remainingMinutes <= 0) {
    throw new RangeError('중요도, 마감일, 남은 소요시간을 확인해 주세요.');
  }
  if (deadlineMs <= nowMs) return 100;
  const remainingHours = (deadlineMs - nowMs) / HOUR;
  const urgency = 1 / (1 + remainingHours / 24);
  const pressure = Math.min(1, remainingMinutes / ((remainingHours / 24) * WORKABLE_MINUTES_PER_DAY));
  const weight = importance / 3;
  const shortness = 60 / (60 + remainingMinutes);
  return Number((100 * (0.4 * urgency + 0.2 * pressure + 0.3 * weight + 0.1 * shortness)).toFixed(2));
}
