import { useState } from 'react';
import TodoActionSheet from '../components/home/TodoActionSheet.jsx';
import useTodoActions from '../hooks/useTodoActions.js';
import { BellIcon, UserIcon, CalendarIcon, ClockIcon, ChevronIcon, CheckIcon, NoteIcon } from '../components/common/Icons.jsx';
import { getBlocksForDate, getTaskById, getTasks } from '../data/sampleSchedule.js';
import { formatKoreanDate, toMinutes, formatDuration, freeMinutes } from '../utils/time.js';

const USER_NAME = '민지'; // TODO: 백엔드 user 연결
const FREE_FROM = 9 * 60;
const FREE_TO = 22 * 60;

function greeting(hour) {
  if (hour < 12) return '좋은 아침이에요.';
  if (hour < 18) return '좋은 오후예요.';
  return '좋은 저녁이에요.';
}

function daysUntil(iso) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`) - today) / 86400000);
}

export default function HomePage({ onOpenMy, onNavigate }) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // 오늘 할 일: 휴식을 뺀 오늘 블록. 이미 끝난 블록은 완료로 시작한다
  const actions = useTodoActions();
  const [openTodo, setOpenTodo] = useState(null);
  const [toast, setToast] = useState('');

  const todos = getBlocksForDate(now)
    .filter((b) => b.kind !== 'break' && !actions.isHidden(b.id))
    .map((b) => ({ ...b, title: actions.metaOf(b.id).title ?? b.title }))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  const [doneIds, setDoneIds] = useState(
    () => new Set(todos.filter((b) => toMinutes(b.end) <= nowMin).map((b) => b.id))
  );
  const [startedId, setStartedId] = useState(null);

  const moveTodo = (id, message) => {
    actions.hide(id, message);
    setOpenTodo(null);
    setToast(message);
    setTimeout(() => setToast(''), 2000);
  };

  const toggleDone = (id) =>
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // 다음 할 일: 아직 안 끝난 첫 작업 블록
  const next = todos.find((b) => b.kind === 'task' && !doneIds.has(b.id));
  const started = next && startedId === next.id;
  const minutesToStart = next ? toMinutes(next.start) - nowMin : 0;

  const nearest = getTasks()
    .map((t) => ({ ...t, left: daysUntil(t.deadline) }))
    .filter((t) => t.left >= 0)
    .sort((a, b) => a.left - b.left)[0];
  const free = freeMinutes(getBlocksForDate(now), Math.max(nowMin, FREE_FROM), FREE_TO);

  const startOrFinish = () => {
    if (!started) setStartedId(next.id);
    else {
      toggleDone(next.id);
      setStartedId(null);
    }
  };

  return (
    <div className="home">
      <header className="home-top">
        <span className="home-date">{formatKoreanDate(now)}</span>
        <div className="page-header-actions">
          <button type="button" className="icon-button" aria-label="알림">
            <BellIcon />
          </button>
          <button type="button" className="icon-button" onClick={onOpenMy} aria-label="마이">
            <UserIcon />
          </button>
        </div>
      </header>

      <h1 className="home-greeting">
        {USER_NAME} 님,
        <br />
        {greeting(now.getHours())}
      </h1>
      <p className="home-sub">오늘도 차분하고 좋은 하루가 되길 바라요.</p>

      <div className="summary-row">
        <button type="button" className="summary-card" onClick={() => onNavigate('tasks')}>
          <span className="summary-icon">
            <CalendarIcon />
          </span>
          <span className="summary-text">
            <small>가장 빠른 마감</small>
            <strong className="is-urgent">{nearest ? (nearest.left === 0 ? 'D-DAY' : `D-${nearest.left}`) : '-'}</strong>
          </span>
          <ChevronIcon size={14} />
        </button>
        <button type="button" className="summary-card" onClick={() => onNavigate('calendar')}>
          <span className="summary-icon">
            <ClockIcon />
          </span>
          <span className="summary-text">
            <small>오늘의 여유 시간</small>
            <strong>
              총 <b>{formatDuration(free)}</b>
            </strong>
          </span>
          <ChevronIcon size={14} />
        </button>
      </div>

      {next && (
        <section className="next-card">
          <div className="next-label">
            <i /> 다음 할 일 · {next.start}
          </div>
          <h2>{next.title}</h2>
          <p>{[next.note, getTaskById(next.taskId)?.title].filter(Boolean).join(' · ')}</p>
          <div className="next-foot">
            <span>
              {started ? '진행 중' : minutesToStart > 0 ? `${minutesToStart}분 뒤 시작` : '지금 시작할 시간이에요'}
            </span>
            <button type="button" className="next-start" onClick={startOrFinish}>
              {started ? '완료하기' : '시작하기'} <ChevronIcon size={16} />
            </button>
          </div>
        </section>
      )}

      <section className="todo-section">
        <div className="todo-head">
          <h2>오늘 할 일</h2>
          <span>
            {doneIds.size} / {todos.length} 완료
          </span>
        </div>
        <ul className="todo-list">
          {todos.map((b) => (
            <li key={b.id}>
              <button type="button" className="todo-open" onClick={() => setOpenTodo(b)}>
                <span className="todo-time">{b.start}</span>
                <span className="todo-body">
                  <strong className={doneIds.has(b.id) ? 'is-done' : ''}>{b.title}</strong>
                  <small>{b.location ?? b.note ?? KIND_FALLBACK[b.kind]}</small>
                  {actions.metaOf(b.id).memo && (
                    <small className="todo-memo-line">
                      <NoteIcon size={12} />
                      <span>{actions.metaOf(b.id).memo}</span>
                    </small>
                  )}
                </span>
              </button>
              <button
                type="button"
                className={`todo-check ${doneIds.has(b.id) ? 'is-on' : ''}`}
                onClick={() => toggleDone(b.id)}
                aria-label={doneIds.has(b.id) ? '완료 취소' : '완료'}
              >
                {doneIds.has(b.id) && <CheckIcon size={16} />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {openTodo && (
        <TodoActionSheet
          todo={openTodo}
          meta={actions.metaOf(openTodo.id)}
          onPatch={(fields) => actions.patch(openTodo.id, fields)}
          onMove={(message) => moveTodo(openTodo.id, message)}
          onClose={() => setOpenTodo(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const KIND_FALLBACK = { routine: '루틴', fixed: '고정 일정', event: '일정', task: '작업' };
