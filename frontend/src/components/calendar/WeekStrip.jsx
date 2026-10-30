import { WEEKDAY_LABELS, getWeekDays, isSameDay } from '../../utils/calendar.js';

// 이번 주 월~일 한 줄. 선택한 날은 검은 칸으로 표시한다
export default function WeekStrip({ selected, onSelect }) {
  const today = new Date();
  return (
    <nav className="week-strip" aria-label="이번 주">
      {getWeekDays(selected).map((day, i) => {
        const active = isSameDay(day, selected);
        return (
          <button
            key={day.toISOString()}
            type="button"
            className={`week-day ${active ? 'is-active' : ''} ${isSameDay(day, today) ? 'is-today' : ''}`}
            aria-current={active ? 'date' : undefined}
            onClick={() => onSelect(day)}
          >
            <span className="week-day-label">{WEEKDAY_LABELS[i]}</span>
            <span className="week-day-num">{day.getDate()}</span>
          </button>
        );
      })}
    </nav>
  );
}
