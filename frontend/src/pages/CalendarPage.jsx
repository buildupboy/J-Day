import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';
import WeekStrip from '../components/calendar/WeekStrip.jsx';
import DayTimetable from '../components/calendar/DayTimetable.jsx';
import MonthGrid from '../components/calendar/MonthGrid.jsx';

export default function CalendarPage({ onOpenMy }) {
  const [view, setView] = useState('week');
  const [selected, setSelected] = useState(() => new Date());

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
          <>
            <WeekStrip selected={selected} onSelect={setSelected} />
            <DayTimetable date={selected} />
          </>
        ) : (
          <MonthGrid
            year={selected.getFullYear()}
            month={selected.getMonth()}
            selected={selected}
            onSelect={pickFromMonth}
          />
        )}
      </div>
    </div>
  );
}
