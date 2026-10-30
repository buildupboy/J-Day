import { useState } from 'react';
import PageHeader from '../components/common/PageHeader.jsx';

export default function CalendarPage({ onOpenMy }) {
  const [view, setView] = useState('week');

  return (
    <>
      <PageHeader title={`${new Date().getMonth() + 1}월`} onOpenMy={onOpenMy} />
      <div className="page-body">
        <div className="segmented">
          <button
            type="button"
            className={view === 'week' ? 'is-active' : ''}
            onClick={() => setView('week')}
          >
            주
          </button>
          <button
            type="button"
            className={view === 'month' ? 'is-active' : ''}
            onClick={() => setView('month')}
          >
            월
          </button>
        </div>
        <p className="placeholder">
          {view === 'week' ? '주간 타임테이블' : '월간 캘린더'} — 블록을 누르면 하위 작업 목록이 보여요
        </p>
      </div>
    </>
  );
}
