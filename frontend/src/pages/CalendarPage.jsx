import { useRef, useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import WeekStrip from '../components/calendar/WeekStrip.jsx';
import DayTimetable from '../components/calendar/DayTimetable.jsx';
import MonthGrid from '../components/calendar/MonthGrid.jsx';
import BlockDetailSheet from '../components/calendar/BlockDetailSheet.jsx';
import useBlockDetails from '../hooks/useBlockDetails.js';
import { addDays } from '../utils/calendar.js';
import useLiveSchedule from '../hooks/useLiveSchedule.js';

const SWIPE_MIN_PX = 60;

export default function CalendarPage({ onOpenMy }) {
  const [view, setView] = useState('week');
  const [selected, setSelected] = useState(() => new Date());
  const schedule = useLiveSchedule(selected, view);

  const swipeStart = useRef(null);
  const [openBlock, setOpenBlock] = useState(null);
  const details = useBlockDetails();

  // 왼쪽으로 밀면 다음 주, 오른쪽으로 밀면 이전 주 (같은 요일 유지)
  const onSwipeEnd = (e) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setSelected((d) => addDays(d, dx < 0 ? 7 : -7));
  };

  const pickFromMonth = (day) => {
    setSelected(day);
    setView('week');
  };

  const toggle = (
    <div className="segmented">
      {[
        ['week', '주'],
        ['month', '월'],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={view === id ? 'is-active' : ''}
          onClick={() => setView(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="calendar-page">
      <PageHeader title={`${selected.getMonth() + 1}월`} onOpenMy={onOpenMy} />
      <div className="page-body calendar-body">
        {schedule.error && <p className="field-error" role="alert">일정을 불러오지 못했어요. {schedule.error}</p>}
        {schedule.loading && <p role="status">일정을 불러오는 중이에요.</p>}
        <div className="calendar-toolbar">{toggle}</div>
        {view === 'week' ? (
          <div
            className="week-swipe"
            onPointerDown={(e) => {
              swipeStart.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={onSwipeEnd}
            onPointerCancel={() => {
              swipeStart.current = null;
            }}
          >
            <WeekStrip selected={selected} onSelect={setSelected} blocksForDate={schedule.blocksForDate} />
            <DayTimetable date={selected} blocks={schedule.blocksForDate(selected)} onSelectBlock={setOpenBlock} statusOf={details.statusOf} />
          </div>
        ) : (
          <MonthGrid
            year={selected.getFullYear()}
            month={selected.getMonth()}
            selected={selected}
            onSelect={pickFromMonth}
            blocksForDate={schedule.blocksForDate}
          />
        )}
      </div>
      {openBlock && (
        <BlockDetailSheet
          block={openBlock}
          details={details}
          onClose={() => setOpenBlock(null)}
        />
      )}
    </div>
  );
}
