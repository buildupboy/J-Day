import { WEEKDAY_LABELS, getMonthGrid, isSameDay } from '../../utils/calendar.js';
import { getBlocksForDate } from '../../data/sampleSchedule.js';

// 월간 달력. 날짜를 누르면 onSelect로 넘겨 주 보기로 전환한다
export default function MonthGrid({ year, month, selected, onSelect }) {
  const today = new Date();
  return (
    <div className="month-grid">
      {WEEKDAY_LABELS.map((w) => (
        <div key={w} className="month-head">
          {w}
        </div>
      ))}
      {getMonthGrid(year, month).map((day) => {
        const inMonth = day.getMonth() === month;
        const dots = Math.min(getBlocksForDate(day).length, 3);
        const classes = [
          'month-cell',
          inMonth ? '' : 'is-out',
          isSameDay(day, selected) ? 'is-active' : '',
          isSameDay(day, today) ? 'is-today' : '',
        ].join(' ');
        return (
          <button key={day.toISOString()} type="button" className={classes} onClick={() => onSelect(day)}>
            <span className="month-num">{day.getDate()}</span>
            <span className="week-day-dots">
              {inMonth && Array.from({ length: dots }, (_, k) => <i key={k} />)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
