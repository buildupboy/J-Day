import { useRef, useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import WeekStrip from '../components/calendar/WeekStrip.jsx';
import DayTimetable from '../components/calendar/DayTimetable.jsx';
import MonthGrid from '../components/calendar/MonthGrid.jsx';
import BlockDetailSheet from '../components/calendar/BlockDetailSheet.jsx';
import { addDays } from '../utils/calendar.js';

const SWIPE_MIN_PX = 60;

export default function CalendarPage({ onOpenMy }) {
  const [view, setView] = useState('week');
  const [selected, setSelected] = useState(() => new Date());

  const swipeStart = useRef(null);
  const [openBlock, setOpenBlock] = useState(null);
  const [toggled, setToggled] = useState(() => new Set()); // 샘플 기본값에서 완료 상태를 뒤집은 하위 작업 id

  const toggleSubtask = (id) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // 왼쪽으로 밀면 이전 주, 오른쪽으로 밀면 다음 주 (같은 요일 유지)
  const onSwipeEnd = (e) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setSelected((d) => addDays(d, dx < 0 ? -7 : 7));
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
            <WeekStrip selected={selected} onSelect={setSelected} />
            <DayTimetable date={selected} onSelectBlock={setOpenBlock} />
          </div>
        ) : (
          <MonthGrid
            year={selected.getFullYear()}
            month={selected.getMonth()}
            selected={selected}
            onSelect={pickFromMonth}
          />
        )}
      </div>
      {openBlock && (
        <BlockDetailSheet
          block={openBlock}
          toggled={toggled}
          onToggle={toggleSubtask}
          onClose={() => setOpenBlock(null)}
        />
      )}
    </div>
  );
}
