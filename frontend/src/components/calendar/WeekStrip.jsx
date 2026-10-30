import { WEEKDAY_LABELS, getWeekDays, isSameDay } from '../../utils/calendar.js';
import { getBlocksForDate } from '../../data/sampleSchedule.js';

// 요일·날짜 한 줄. 날짜 아래 점은 그날의 블록 수(최대 3개)
export default function WeekStrip({ selected, onSelect }) {
  return (
    <div className="week-strip">
      {getWeekDays(selected).map((day, i) => {
        const dots = Math.min(getBlocksForDate(day).length, 3);
        const active = isSameDay(day, selected);
        return (
          <button
            key={day.toISOString()}
            type="button"
            className={`week-day ${active ? 'is-active' : ''}`}
            onClick={() => onSelect(day)}
          >
            <span className="week-day-label">{WEEKDAY_LABELS[i]}</span>
            <span className="week-day-num">{day.getDate()}</span>
            <span className="week-day-dots">
              {Array.from({ length: dots }, (_, k) => (
                <i key={k} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
