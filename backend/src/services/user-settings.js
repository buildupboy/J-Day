import { minute, instant } from '../scheduler/time.js';
import { sleepIntervals } from '../scheduler/sleep.js';
import { restIntervals } from '../scheduler/rest.js';
import { PREFERRED_PERIODS } from '../scheduler/preferred-period.js';

export const DEFAULTS = { dayStart: '07:00', dayEnd: '24:00', minSlotMinutes: 30, maxBlockMinutes: 90, breakMinutes: 10, maxDailyMinutes: 1440, bufferMinutes: 0, distribution: 'early', sleep: null, restPeriods: [], preferredPeriod: null };
const fields = new Set(['breakMinutes', 'sleep', 'dayStart', 'dayEnd', 'maxBlockMinutes', 'maxDailyMinutes', 'distribution', 'restPeriods', 'preferredPeriod']);
function fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
export function effectiveSettings(settings = {}) { return { ...DEFAULTS, ...settings }; }
export function mergeSettings(stored = {}, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length) fail('변경할 설정을 입력해 주세요.');
  for (const field of Object.keys(patch)) if (!fields.has(field)) fail(`수정할 수 없는 설정: ${field}`);
  const merged = effectiveSettings({ ...stored, ...patch });
  try {
    if (minute(merged.dayStart) >= minute(merged.dayEnd)) fail('작업 시작은 종료보다 빨라야 해요.');
    if (!Number.isInteger(merged.breakMinutes) || merged.breakMinutes < 0 || merged.breakMinutes > 120) fail('휴식은 0~120분으로 입력해 주세요.');
    if (!Number.isInteger(merged.maxBlockMinutes) || merged.maxBlockMinutes < merged.minSlotMinutes || merged.maxBlockMinutes > 1440) fail(`연속 작업 시간은 최소 작업 단위 ${merged.minSlotMinutes}분 이상이어야 해요.`);
    if (!Number.isInteger(merged.maxDailyMinutes) || merged.maxDailyMinutes < 0 || merged.maxDailyMinutes > 1440) fail('하루 작업량은 0~1440분으로 입력해 주세요.');
    if (!['early', 'balanced'].includes(merged.distribution)) fail('배치 방식은 early 또는 balanced여야 해요.');
    if (merged.preferredPeriod !== null && (typeof merged.preferredPeriod !== 'string' || !Object.hasOwn(PREFERRED_PERIODS, merged.preferredPeriod))) fail('희망 시간대는 아침·낮·저녁·새벽 중에서 선택해 주세요.');
    try { restIntervals(merged); } catch { fail('지정 휴식은 최대 8개이며 시작·종료에 유효한 서로 다른 시간을 입력해 주세요.'); }
    if (merged.sleep !== null) {
      if (typeof merged.sleep !== 'object' || Array.isArray(merged.sleep) || Object.keys(merged.sleep).some((key) => !['start', 'end'].includes(key))) fail('수면 시간 형식이 올바르지 않아요.');
      sleepIntervals(merged);
    }
  } catch (error) { if (error.status) throw error; fail('유효한 HH:mm 시각을 입력하고 취침과 기상은 다르게 설정해 주세요.'); }
  return merged;
}
export function settingsSnapshot(db, now) {
  const blocks = db.scheduledBlocks || [];
  return {
    settings: effectiveSettings(db.user?.settings),
    configuredFields: Object.keys(db.user?.settings || {}),
    fixedCount: (db.fixedBlocks || []).length,
    futurePlannedBlocks: blocks.filter((block) => block.status === 'planned' && instant(block, 'start') >= +now).length,
    ongoingBlocks: blocks.filter((block) => block.status === 'planned' && instant(block, 'start') < +now && instant(block, 'end') > +now).length,
  };
}
