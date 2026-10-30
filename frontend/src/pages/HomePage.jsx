import { useEffect, useState } from 'react';
import BlockDetailSheet from '../components/calendar/BlockDetailSheet.jsx';
import DeadlineSheet from '../components/home/DeadlineSheet.jsx';
import FreeTimeSheet from '../components/home/FreeTimeSheet.jsx';
import useTodoActions from '../hooks/useTodoActions.js';
import useBlockDetails from '../hooks/useBlockDetails.js';
import { queueReschedule, delayPendingReschedule } from '../hooks/useDeferredReschedule.js';
import { BellIcon, SpeakerIcon, MicIcon, StopIcon, CalendarIcon, ClockIcon, ChevronIcon } from '../components/common/Icons.jsx';
import useLiveSchedule, { scheduleChanged, dateKey } from '../hooks/useLiveSchedule.js';
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis.js';
import { api } from '../api/client.js';
import { toMinutes, formatDuration, freeSlots, fromMinutes } from '../utils/time.js';
import { priorityOf, FIXED_KIND_LABEL, formatLongDate, formatClock, josa, daysUntil, dDay } from '../utils/labels.js';

const KIND_LABEL = { routine: '루틴', fixed: '고정 일정', task: '작업' };
const OVERRUN_WINDOW = 180; // 분
const FREE_FROM = 7 * 60; // 여유 시간을 세는 하루 시작
const FREE_TO = 24 * 60;
const FREE_MIN_GAP = 20; // 이보다 짧은 틈은 휴식으로 두고 세지 않는다
const COUNT_WORD = ['', '한', '두', '세', '네', '다섯'];
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const CONFIRM_KEY = 'jday-briefing-confirmed';

// '좋아, 이대로'를 누른 날짜를 기억해 그날은 브리핑 카드를 다시 띄우지 않는다
function readConfirmed() {
  try {
    return localStorage.getItem(CONFIRM_KEY) === dateKey(new Date());
  } catch {
    return false;
  }
}

const hourText = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return m ? `${h}시 ${m}분` : `${h}시`;
};

// 제이의 아침 브리핑 문장: 오늘 고정 일정 요약 + 작업을 넣은 시간
function briefingText(blocks) {
  const classes = blocks.filter((b) => b.fixedKind === 'class').length;
  const job = blocks.find((b) => b.fixedKind === 'job');
  const fixed = [classes && `수업 ${classes}개`, job && `${hourText(job.start)}부터 ${job.title}`].filter(Boolean);
  const tasks = blocks.filter((b) => b.kind === 'task' && b.status !== 'done').slice(0, 2);
  const first = fixed.length ? `오늘은 ${josa(fixed.join(', '), '이', '가')} 있어요.` : '오늘은 고정 일정이 없어요.';
  if (!tasks.length) return `${first} 배치된 작업이 없으니 여유롭게 보내도 돼요.`;
  const placed = tasks.map((t) => `${josa(t.title, '은', '는')} ${hourText(t.start)}`).join(', ');
  return `${first} ${placed}에 넣었어요. 이대로 갈까요?`;
}

export default function HomePage({ nav }) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const schedule = useLiveSchedule(now);
  const { speak, speaking, cancel } = useSpeechSynthesis();

  const actions = useTodoActions();
  const details = useBlockDetails();
  const [openTodoId, setOpenTodoId] = useState(null);
  const [toast, setToast] = useState('');
  const [confirmed, setConfirmed] = useState(readConfirmed);
  const [sheet, setSheet] = useState(null); // 'deadline' | 'free'

  const confirmBriefing = () => {
    setConfirmed(true);
    cancel();
    showToast('좋아요, 이대로 진행할게요.');
    try {
      localStorage.setItem(CONFIRM_KEY, dateKey(new Date()));
    } catch {
      /* 이번 화면에서만 유지 */
    }
  };
  const [localDoneIds, setDoneIds] = useState(() => new Set());
  const [, setTick] = useState(0);

  // 지금 하는 작업의 남은 시간이 흐르도록 30초마다 다시 그린다
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2000);
  };

  // 오늘 할 일: 휴식을 뺀 오늘 블록을 시간순으로
  const today = schedule.blocksForDate(now, { grouped: false }).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const todos = today
    .filter((b) => b.kind !== 'break' && !actions.isHidden(b.id))
    .map((b) => ({ ...b, title: actions.metaOf(b.id).title ?? b.title }));
  const doneIds = new Set([...localDoneIds, ...todos.filter((b) => b.status === 'done').map((b) => b.id)]);

  // 예정 종료가 지났는데 종료 보고가 없는 작업은 아직 하는 중으로 본다 (최근 3시간 안)
  const overrun = todos
    .filter((b) => b.kind === 'task' && b.status === 'planned' && !doneIds.has(b.id))
    .filter((b) => toMinutes(b.end) <= nowMin && nowMin - toMinutes(b.end) <= OVERRUN_WINDOW)
    .at(-1);
  // 이미 끝낸 작업 블록은 '지금'으로 보지 않는다
  const current =
    overrun ??
    todos.find(
      (b) => toMinutes(b.start) <= nowMin && nowMin < toMinutes(b.end) && !(b.kind === 'task' && doneIds.has(b.id))
    );
  const next = todos.find((b) => toMinutes(b.start) > nowMin);
  const currentPriority = current?.kind === 'task' ? priorityOf(current.task) : null;
  // 상위 작업 이름 · 아직 안 끝난 다른 하위작업
  const liveDetail = current?.task
    ? [
        current.task.title !== current.title && current.task.title,
        current.task.subtasks
          ?.filter((st) => !st.done && st.id !== current.subtaskId)
          .slice(0, 2)
          .map((st) => st.title)
          .join(', '),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const toggleDone = async (block) => {
    if (block.taskId) {
      if (doneIds.has(block.id)) {
        showToast('완료 취소는 아직 지원하지 않아요.');
        return;
      }
      // 시작 전 블록도 미리 완료할 수 있다. 기록만 바로 저장하고, 비는 시간의 재배치는 10초 뒤에 한 번만 한다
      setDoneIds((prev) => new Set(prev).add(block.id));
      try {
        await api.reportProgress(block.taskId, {
          blockId: block.id,
          blockStatus: 'done',
          reschedule: false,
          ...(block.subtaskId ? { subtaskId: block.subtaskId, subtaskDone: true } : {}),
        });
        scheduleChanged();
        queueReschedule();
      } catch (error) {
        setDoneIds((prev) => {
          const nextIds = new Set(prev);
          nextIds.delete(block.id);
          return nextIds;
        });
        showToast(error.message);
      }
      return;
    }
    setDoneIds((prev) => {
      const nextIds = new Set(prev);
      if (!nextIds.delete(block.id)) nextIds.add(block.id);
      return nextIds;
    });
    delayPendingReschedule();
  };

  // 하위작업을 눌러도 상세는 상위 작업 기준으로 보여 준다 (이 하위작업은 '이 시간에 할 일'로 표시됨)
  const openBlock = today.find((b) => b.id === openTodoId);
  const openTodo = openBlock && (openBlock.task ? { ...openBlock, title: openBlock.task.title } : openBlock);

  const briefing = briefingText(today);

  // 가장 빠른 마감: 끝나지 않은 작업 중 마감이 가장 가까운 것
  const nearest = schedule.tasks
    .filter((t) => t.status !== 'done' && new Date(t.deadline) >= now)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
  const nearestDate = nearest && new Date(`${nearest.deadline.slice(0, 10)}T00:00:00`);

  // 오늘의 여유 시간: 지금 이후 빈 틈. 앞뒤 일정 이름을 붙인다
  const slots = freeSlots(today, Math.max(nowMin, FREE_FROM), FREE_TO, FREE_MIN_GAP).map((slot) => ({
    ...slot,
    before: [...today].reverse().find((b) => toMinutes(b.end) <= slot.start)?.title,
    after: today.find((b) => toMinutes(b.start) >= slot.end)?.title,
  }));
  const freeTotal = slots.reduce((sum, slot) => sum + slot.minutes, 0);
  const freeLine = slots.length
    ? `${slots.slice(0, 3).map((slot) => fromMinutes(slot.start)).join(' · ')} ${COUNT_WORD[slots.length] ?? slots.length} 번`
    : '남은 빈 시간이 없어요';

  const metaOf = (b) => {
    const minutes = toMinutes(b.end) - toMinutes(b.start);
    const context =
      b.kind === 'task'
        ? (b.task && b.task.title !== b.title ? b.task.title : b.note) ?? '작업'
        : b.location ?? FIXED_KIND_LABEL[b.fixedKind] ?? KIND_LABEL[b.kind];
    return `${b.start} · ${formatDuration(minutes)} · ${context}`;
  };

  return (
    <div className="d-page">
      <header className="d-header">
        <div>
          <p className="d-sub">
            {formatLongDate(now)} · {formatClock(now)}
          </p>
          <h1 className="d-title">오늘도 J처럼, 차근차근</h1>
        </div>
        <button type="button" className="d-icon-btn" aria-label="알림">
          <BellIcon size={20} />
          <span className="d-dot" aria-hidden="true" />
        </button>
      </header>

      {schedule.error && (
        <p className="d-alert" role="alert">
          일정을 불러오지 못했어요. 백엔드 서버가 켜져 있는지 확인해 주세요. ({schedule.error})
        </p>
      )}

      {!confirmed && (
      <section className="d-card briefing" aria-label="제이의 아침 브리핑">
        <div className="briefing-head">
          <div className="briefing-who">
            <span className="j-mark" aria-hidden="true">
              J
            </span>
            <p>아침 브리핑</p>
          </div>
          <button
            type="button"
            className="d-text-btn"
            onClick={() => (speaking ? cancel() : speak(briefing))}
            disabled={schedule.loading}
          >
            {speaking ? <StopIcon size={14} /> : <SpeakerIcon size={16} />}
            {speaking ? '멈추기' : '듣기'}
          </button>
        </div>
        <p className="briefing-text">{schedule.loading ? '오늘 일정을 살펴보는 중이에요…' : briefing}</p>
        <div className="d-grid-2">
          <button type="button" className="d-btn d-btn-dark" disabled={schedule.loading} onClick={confirmBriefing}>
            좋아, 이대로
          </button>
          <button type="button" className="d-btn d-btn-line" onClick={() => nav.open('voice')}>
            <MicIcon size={16} />
            말로 조정
          </button>
        </div>
      </section>
      )}

      <div className="summary-grid" aria-label="오늘 요약">
        <button type="button" className="summary-tile" onClick={() => nearest && setSheet('deadline')} disabled={!nearest}>
          <span className="summary-label">
            <span>
              <CalendarIcon size={14} />
              가장 빠른 마감
            </span>
            <ChevronIcon size={14} />
          </span>
          {nearest ? (
            <>
              <span className="summary-value">
                {dDay(daysUntil(nearest.deadline, now))}
                <small>
                  {nearestDate.getMonth() + 1}/{nearestDate.getDate()} ({WEEKDAY[nearestDate.getDay()]})
                </small>
              </span>
              <span className="summary-note">{nearest.title}</span>
            </>
          ) : (
            <>
              <span className="summary-value">-</span>
              <span className="summary-note">{schedule.loading ? '불러오는 중이에요' : '다가오는 마감이 없어요'}</span>
            </>
          )}
        </button>
        <button type="button" className="summary-tile" onClick={() => setSheet('free')}>
          <span className="summary-label">
            <span>
              <ClockIcon size={14} />
              오늘의 여유 시간
            </span>
            <ChevronIcon size={14} />
          </span>
          <span className="summary-value">{formatDuration(freeTotal)}</span>
          <span className="summary-note">{freeLine}</span>
        </button>
      </div>

      {current?.kind === 'task' && !doneIds.has(current.id) ? (
        <section className="live-card" aria-label="지금 하는 작업">
          <div className="live-top">
            <p className="live-status">
              <i className={current === overrun ? 'is-over' : ''} aria-hidden="true" />
              {current === overrun ? '시간 초과' : '지금 하는 중'} · {current.start} – {current.end}
            </p>
            {currentPriority && <span className="live-chip">{currentPriority.label}</span>}
          </div>
          <div className="live-body">
            <h2>{current.title}</h2>
            {liveDetail && <p>{liveDetail}</p>}
          </div>
          <div className="live-time">
            <strong>{formatDuration(Math.abs(toMinutes(current.end) - nowMin) || 1)}</strong>
            <span>
              {current === overrun ? `지났어요 · ${current.end} 종료 예정이었어요` : `남았어요 · ${current.end} 종료 예정`}
            </span>
          </div>
          <div className="live-foot">
            <p>
              {next ? (
                <>
                  <span>다음</span> {next.start} {next.title}
                </>
              ) : (
                <span>오늘 남은 일정이 없어요</span>
              )}
            </p>
            <button
              type="button"
              className="live-stop"
              onClick={() => nav.finish({ block: current, blocks: today, taskById: schedule.taskById })}
            >
              <StopIcon size={12} />
              종료하기
            </button>
          </div>
        </section>
      ) : (
        <section className="d-card idle-card" aria-label="지금과 다음 일정">
          <p className="live-status">
            <i className="is-idle" aria-hidden="true" />
            {current ? `지금 · ${current.start} – ${current.end}` : '지금 하는 작업이 없어요'}
          </p>
          {current && (
            <p className="idle-title">
              {current.title}
              <span> · {FIXED_KIND_LABEL[current.fixedKind] ?? KIND_LABEL[current.kind]}</span>
            </p>
          )}
          <p className="idle-next">
            {next ? (
              <>
                <span>다음</span> {next.start} {next.title}
              </>
            ) : (
              '오늘 남은 일정이 없어요'
            )}
          </p>
        </section>
      )}

      <section className="d-section" aria-label="오늘 할 일">
        <div className="d-section-head">
          <h2>오늘 할 일</h2>
          <button type="button" className="d-link" onClick={() => nav.tab('tasks', 'upcoming')}>
            전체 일정
          </button>
        </div>
        {todos.length === 0 ? (
          <p className="d-empty">{schedule.loading ? '불러오는 중이에요…' : '오늘은 할 일이 없어요.'}</p>
        ) : (
          <ul className="d-card d-list">
            {todos.map((b) => {
              const done = doneIds.has(b.id);
              const priority = b.kind === 'task' ? priorityOf(b.task) : null;
              return (
                <li key={b.id} className="todo-item">
                  <input
                    type="checkbox"
                    className="d-check"
                    checked={done}
                    onChange={() => toggleDone(b)}
                    aria-label={`${b.title} ${done ? '완료 취소' : '완료'}`}
                  />
                  <button type="button" className="todo-text" onClick={() => setOpenTodoId(b.id)}>
                    <span className={`todo-title ${done ? 'is-done' : ''}`}>{b.title}</span>
                    <span className="todo-meta">{metaOf(b)}</span>
                    {(b.memo ?? b.task?.memo) && <span className="todo-meta">메모 · {b.memo ?? b.task.memo}</span>}
                  </button>
                  {priority && <span className={`d-chip is-${priority.tone}`}>{priority.label}</span>}
                  {b.kind === 'routine' && <span className="d-chip is-routine">Routine</span>}
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className="d-link d-link-center" onClick={() => nav.tab('calendar')}>
          캘린더에서 시간표로 보기
        </button>
      </section>

      {sheet === 'deadline' && nearest && <DeadlineSheet task={nearest} nav={nav} onClose={() => setSheet(null)} />}
      {sheet === 'free' && (
        <FreeTimeSheet
          slots={slots}
          total={freeTotal}
          minGap={FREE_MIN_GAP}
          suggestTask={nearest?.title}
          nav={nav}
          onClose={() => setSheet(null)}
        />
      )}
      {/* 캘린더와 같은 일정 상세. 최신 일정에서 다시 찾아 수정·삭제가 바로 반영된다 */}
      {openTodo && <BlockDetailSheet block={openTodo} details={details} onClose={() => setOpenTodoId(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
