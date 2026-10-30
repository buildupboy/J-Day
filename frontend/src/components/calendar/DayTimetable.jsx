import { toMinutes } from '../../utils/time.js';
import { isSameDay } from '../../utils/calendar.js';
import { getBlocksForDate } from '../../data/sampleSchedule.js';

const START_HOUR = 7;
const END_HOUR = 24;
const HOUR_HEIGHT = 64; // px

const top = (minutes) => ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;

// 하루 타임테이블. 블록은 시작·종료 시각으로 절대 위치를 잡는다
export default function DayTimetable({ date }) {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow =
    isSameDay(date, now) && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60;

  return (
    <div className="timetable" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT + 16 }}>
      {hours.map((h) => (
        <div key={h} className="tt-hour" style={{ top: top(h * 60) }}>
          <span>{String(h).padStart(2, '0')}:00</span>
        </div>
      ))}

      {getBlocksForDate(date).map((b) => {
        const s = toMinutes(b.start);
        const e = toMinutes(b.end);
        return (
          <div
            key={b.id}
            className={`tt-block tt-${b.kind}`}
            style={{ top: top(s), height: Math.max(top(e) - top(s) - 2, 14) }}
          >
            {b.kind === 'break' ? (
              <span className="tt-break-label">{b.title}</span>
            ) : (
              <>
                <strong>{b.title}</strong>
                <span>
                  {b.start}–{b.end}
                  {b.note ? ` · ${b.note}` : ''}
                </span>
              </>
            )}
          </div>
        );
      })}

      {showNow && <div className="tt-now" style={{ top: top(nowMinutes) }} />}
    </div>
  );
}
