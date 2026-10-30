export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const COLORS = ['#e7edf8', '#f7e8e3', '#e8eee0', '#f4edd9', '#ece6f5', '#def0ef'];
export default function WeekTimetable({ lessons, visibleDays = [], onSelect, onAdd, disabled = false, monochrome = false }) {
  const days = [1, 2, 3, 4, 5, 6, 0];
  const minutes = (value) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const dated = lessons.filter((item) => item.date);
  const valid = lessons.filter((item) => !item.date && item.start && item.end && item.start < item.end);
  const first = Math.min(9, ...valid.map((item) => Math.floor(minutes(item.start) / 60)));
  const last = Math.max(18, ...valid.map((item) => Math.ceil(minutes(item.end) / 60)));
  const scale = 40;
  return <><div className="timetable-scroll"><div className="timetable-grid" style={{ width: '100%' }}>
    <div className="timetable-grid-heading" style={{ gridTemplateColumns: `30px repeat(${days.length}, 1fr)` }}><span />{days.map((day) => <strong key={day}>{WEEKDAYS[day]}</strong>)}</div>
    <div className="timetable-grid-body" style={{ height: (last - first) * scale }}>
      {Array.from({ length: last - first }, (_, index) => <div className="timetable-hour" style={{ top: index * scale, height: scale }} key={index}><span>{first + index}</span></div>)}
      {days.map((day, column) => <div key={day} className="timetable-day" style={{ left: `calc(30px + (100% - 30px) * ${column} / ${days.length})`, width: `calc((100% - 30px) / ${days.length})` }}>
        {onAdd && Array.from({ length: (last - first) * 2 }, (_, index) => {
          const start = first * 60 + index * 30;
          if (valid.some((item) => item.dayOfWeek.includes(day) && minutes(item.start) < start + 30 && minutes(item.end) > start)) return null;
          const time = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
          return <button type="button" key={`slot-${index}`} className="timetable-empty-slot" disabled={disabled} style={{ top: index * scale / 2, height: scale / 2 }} aria-label={`${WEEKDAYS[day]}요일 ${time} 수업 추가`} onClick={() => onAdd(day, time)}><span aria-hidden="true">+</span></button>;
        })}
        {valid.filter((item) => item.dayOfWeek.includes(day)).map((item) => {
          const Tag = onSelect ? 'button' : 'div';
          return <Tag key={`${item.id}-${day}`} {...(onSelect ? { type: 'button', disabled, onClick: () => onSelect(item), 'aria-label': `${item.title} ${WEEKDAYS[day]}요일 ${item.start}–${item.end} 수정` } : {})} className={`timetable-class${onSelect ? ' is-editable' : ''}`} title={`${item.title} ${item.start}–${item.end} ${item.location || ''}`} style={{ top: (minutes(item.start) - first * 60) / 60 * scale, height: (minutes(item.end) - minutes(item.start)) / 60 * scale, background: monochrome ? '#e5e7eb' : COLORS[lessons.indexOf(item) % COLORS.length] }}><strong>{item.title}</strong><span>{item.start}–{item.end}</span><span>{item.location}</span></Tag>;
        })}
      </div>)}
    </div>
  </div></div>{dated.length > 0 && <div className="fixed-pending-list"><h3>날짜가 지정된 일정</h3>{dated.map((item) => <button type="button" key={item.id} disabled={disabled || !onSelect} onClick={() => onSelect?.(item)}><span>{item.date} · {item.title}</span><small>{item.start || '?'}–{item.end || '?'} {item.location}</small></button>)}</div>}</>;
}
