export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const COLORS = ['#e7edf8', '#f7e8e3', '#e8eee0', '#f4edd9', '#ece6f5', '#def0ef'];
export default function WeekTimetable({ lessons }) {
  const minutes = (value) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const valid = lessons.filter((item) => item.start && item.end && item.start < item.end);
  const first = Math.min(9, ...valid.map((item) => Math.floor(minutes(item.start) / 60)));
  const last = Math.max(18, ...valid.map((item) => Math.ceil(minutes(item.end) / 60)));
  const scale = 45;
  return <div className="timetable-scroll"><div className="timetable-grid" style={{ minWidth: 490 }}>
    <div className="timetable-grid-heading"><span />{[1, 2, 3, 4, 5, 6, 0].map((day) => <strong key={day}>{WEEKDAYS[day]}</strong>)}</div>
    <div className="timetable-grid-body" style={{ height: (last - first) * scale }}>
      {Array.from({ length: last - first }, (_, index) => <div className="timetable-hour" style={{ top: index * scale, height: scale }} key={index}><span>{first + index}</span></div>)}
      {[1, 2, 3, 4, 5, 6, 0].map((day, column) => <div key={day} className="timetable-day" style={{ left: `calc(30px + (100% - 30px) * ${column} / 7)`, width: 'calc((100% - 30px) / 7)' }}>
        {valid.filter((item) => item.dayOfWeek.includes(day)).map((item) => <div key={`${item.id}-${day}`} className="timetable-class" title={`${item.title} ${item.start}–${item.end} ${item.location || ''}`} style={{ top: (minutes(item.start) - first * 60) / 60 * scale, height: (minutes(item.end) - minutes(item.start)) / 60 * scale, background: COLORS[lessons.indexOf(item) % COLORS.length] }}><strong>{item.title}</strong><span>{item.start}–{item.end}</span><span>{item.location}</span></div>)}
      </div>)}
    </div>
  </div></div>;
}
