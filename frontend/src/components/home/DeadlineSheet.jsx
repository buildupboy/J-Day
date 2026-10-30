import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { dateKey } from '../../hooks/useLiveSchedule.js';
import { CloseIcon } from '../common/Icons.jsx';
import { getWeekDays, addDays } from '../../utils/calendar.js';
import { toMinutes, formatDuration } from '../../utils/time.js';
import { priorityOf, TASK_TYPE_LABEL, daysUntil, dDay } from '../../utils/labels.js';
import SheetHandle from '../common/SheetHandle.jsx';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_WEEKS = 6; // 마감까지 이만큼만 조회한다

const shortDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY[d.getDay()]})`;
};

function statusText(task) {
  if (task.status === 'done') return '완료';
  if (task.progress > 0) return `진행 중 · ${Math.round(task.progress * 100)}%`;
  return task.status === 'in_progress' ? '진행 중' : '시작 전';
}

// 01-2 가장 빠른 마감 상세: 마감·예상 시간·상태와 이 작업이 배치된 시간
export default function DeadlineSheet({ task, nav, onClose }) {
  const [blocks, setBlocks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const today = new Date();
    const last = new Date(`${task.deadline.slice(0, 10)}T00:00:00`);
    const starts = [];
    for (let d = getWeekDays(today)[0]; d <= last && starts.length < MAX_WEEKS; d = addDays(d, 7)) starts.push(dateKey(d));
    Promise.all(starts.map((from) => api.getWeekSchedule(from)))
      .then((weeks) => {
        if (!active) return;
        const items = weeks
          .flatMap((w) => w.days.flatMap((day) => day.items.map((item) => ({ ...item, date: day.date }))))
          .filter((item) => item.taskId === task.id && item.date >= dateKey(today));
        setBlocks(items);
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [task]);

  const priority = priorityOf(task);
  const deadline = new Date(task.deadline);
  const todayKey = dateKey(new Date());
  const tag = (b) =>
    b.status === 'done' ? '완료' : b.status === 'missed' ? '미수행' : b.date === todayKey ? '오늘' : '예정';

  return (
    <div className="d-sheet-backdrop" onClick={onClose}>
      <section className="d-sheet" aria-label="가장 빠른 마감 작업" onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        <div className="sheet-head">
          <div className="sheet-title-col">
            <div className="chip-line">
              <span className="d-chip is-could">{TASK_TYPE_LABEL[task.type] ?? '작업'}</span>
              <span className={`d-chip is-${priority.tone}`}>{priority.label}</span>
            </div>
            <h2 className="sheet-title">{task.title}</h2>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="닫기">
            <CloseIcon size={20} />
          </button>
        </div>

        <dl className="info-dl">
          <dt>마감</dt>
          <dd>
            {deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}{' '}
            {task.deadline.slice(11, 16)} · {dDay(daysUntil(task.deadline))}
          </dd>
          <dt>예상 시간</dt>
          <dd>
            {formatDuration(task.estimatedMinutes ?? 0)} <span className="dd-sub">· 완료 {formatDuration(task.actualMinutes ?? 0)}</span>
          </dd>
          <dt>상태</dt>
          <dd>{statusText(task)}</dd>
        </dl>

        <div className="d-section">
          <div className="d-section-head">
            <h3 className="sheet-h3">배치된 시간</h3>
            {blocks && <span className="d-meta">{blocks.length}개</span>}
          </div>
          {error && <p className="d-error">배치된 시간을 불러오지 못했어요. ({error})</p>}
          {!blocks && !error && <p className="soft-list soft-empty">불러오는 중이에요…</p>}
          {blocks && blocks.length === 0 && (
            <p className="soft-list soft-empty">아직 배치된 시간이 없어요. 여유 시간에서 ‘남은 작업 채우기’를 눌러 보세요.</p>
          )}
          {blocks && blocks.length > 0 && (
            <ul className="soft-list">
              {blocks.map((b) => (
                <li key={b.id} className="placed-row">
                  <span>
                    {shortDay(b.date)} {b.start} – {b.end}{' '}
                    <span className="dd-sub">· {formatDuration(toMinutes(b.end) - toMinutes(b.start))}</span>
                  </span>
                  <span className={`placed-tag ${tag(b) === '오늘' ? 'is-today' : ''}`}>{tag(b)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="d-grid-2">
          <button type="button" className="d-btn d-btn-line d-btn-md" onClick={() => nav.tab('tasks', 'upcoming')}>
            전체 일정
          </button>
          <button type="button" className="d-btn d-btn-dark d-btn-md" onClick={() => nav.tab('calendar')}>
            캘린더에서 보기
          </button>
        </div>
      </section>
    </div>
  );
}
