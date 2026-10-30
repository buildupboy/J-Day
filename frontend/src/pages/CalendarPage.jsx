import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import WeekTimetable from '../components/timetable/WeekTimetable.jsx';
import PageHeader from '../components/common/PageHeader.jsx';

export default function CalendarPage({ onOpenMy }) {
  const [view, setView] = useState('week');
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.getTimetable().then((data) => { if (active) setLessons(data.lessons); })
      .catch(() => { if (active) setError('시간표를 불러오지 못했어요. 백엔드 서버를 확인해 주세요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
          {view === 'week' ? '매주 반복되는 나의 수업 시간표' : '월간 캘린더는 준비 중이에요.'}
        </p>
        {view === 'week' && (loading ? <p role="status">시간표를 불러오는 중이에요…</p> : error ? <p role="alert">{error}</p> : lessons.length ? <WeekTimetable lessons={lessons} /> : <p className="placeholder">마이 → 고정 일정에서 시간표 사진을 등록해 주세요.</p>)}
      </div>
    </>
  );
}
