import { useEffect, useRef } from 'react';
import { formatDuration, distributeMinutes } from '../../utils/time.js';
import SheetHandle from '../common/SheetHandle.jsx';

const IMPORTANCE_LABEL = { 3: 'Must', 2: 'Should', 1: 'Could' };
const STATUS_LABEL = { todo: '시작 전', in_progress: '진행 중', done: '완료' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function deadlineText(iso) {
  const due = new Date(iso);
  const day = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  const dday = diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${-diff}`;
  const time = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  return `${due.getMonth() + 1}월 ${due.getDate()}일 (${WEEKDAYS[due.getDay()]}) ${time} · ${dday}`;
}

const dayLabel = (date) => {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
};

// 작업 하나의 상세 시트. 홈의 "가장 빠른 마감" 카드에서 열린다.
// blocks: 이 작업에 배치된 시간 [{ id, date, start, end, status }]
export default function TaskDetailSheet({ task, blocks, onClose, periodLabel = '이번 주' }) {
  const closeButton = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const subtasks = task.subtasks ?? [];
  const doneSubtasks = subtasks.filter((st) => st.done);
  // 하위 작업 시간 합 = 보정된 총 시간 = 배치된 블록 시간의 합
  const subtaskMinutes = distributeMinutes(task.estimatedMinutes ?? 0, subtasks);
  const percent = Math.round((task.progress ?? 0) * 100);
  const doneMinutes = Math.round((task.estimatedMinutes ?? 0) * (task.progress ?? 0));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet sheet-auto" role="dialog" aria-modal="true" aria-label={task.title + ' 상세'} onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus(); } }} onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        <div className="sheet-head">
          <div>
            <span className="kind-chip tt-task">작업</span>
            <h2>{task.title}</h2>
          </div>
          <button ref={closeButton} type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <dl className="detail-list">
          <div>
            <dt>마감일</dt>
            <dd>{deadlineText(task.deadline)}</dd>
          </div>
          <div>
            <dt>예상 소요 시간</dt>
            <dd>
              총 {formatDuration(task.estimatedMinutes ?? 0)} · 완료 {formatDuration(doneMinutes)} ({percent}%)
            </dd>
          </div>
          <div>
            <dt>중요도</dt>
            <dd>{IMPORTANCE_LABEL[task.importance] ?? 'Should'}</dd>
          </div>
          <div>
            <dt>상태</dt>
            <dd>{STATUS_LABEL[task.status] ?? task.status}</dd>
          </div>
          {task.description && (
            <div>
              <dt>설명</dt>
              <dd>{task.description}</dd>
            </div>
          )}
        </dl>

        <div className="subtask-box">
          <div className="subtask-head">
            <h3>배치된 시간</h3>
            <span>{blocks.length ? `${periodLabel} ${blocks.length}개` : `${periodLabel} 없음`}</span>
          </div>
          {blocks.length > 0 && (
            <ul className="subtask-list">
              {blocks.map((b) => (
                <li key={b.id}>
                  <label>
                    <span className={b.status === 'done' ? 'is-done' : ''}>
                      {dayLabel(b.date)} {b.start}–{b.end}
                    </span>
                    <em>{b.status === 'done' ? '완료' : b.status === 'missed' ? '완료 확인 필요' : '예정'}</em>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {subtasks.length > 0 && (
          <div className="subtask-box">
            <div className="subtask-head">
              <h3>하위 작업</h3>
              <span>
                {doneSubtasks.length} / {subtasks.length} 완료
              </span>
            </div>
            <div className="progress">
              <i style={{ width: `${(doneSubtasks.length / subtasks.length) * 100}%` }} />
            </div>
            <ul className="subtask-list">
              {subtasks.map((st, i) => (
                <li key={st.id}>
                  <label>
                    <input type="checkbox" checked={st.done} readOnly disabled />
                    <span className={st.done ? 'is-done' : ''}>{st.title}</span>
                    <em>{formatDuration(subtaskMinutes[i])}</em>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
