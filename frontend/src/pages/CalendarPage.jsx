import { useEffect, useRef, useState } from 'react';
import WeekStrip from '../components/calendar/WeekStrip.jsx';
import MonthGrid from '../components/calendar/MonthGrid.jsx';
import DayTimetable from '../components/calendar/DayTimetable.jsx';
import BlockDetailSheet from '../components/calendar/BlockDetailSheet.jsx';
import { PlusIcon, StopIcon } from '../components/common/Icons.jsx';
import useBlockDetails from '../hooks/useBlockDetails.js';
import useLiveSchedule from '../hooks/useLiveSchedule.js';
import { useRescheduling } from '../hooks/useDeferredReschedule.js';
import { addDays, isSameDay } from '../utils/calendar.js';
import { toMinutes } from '../utils/time.js';
import { priorityOf, formatLongDate, formatClock } from '../utils/labels.js';

const SWIPE_MIN_PX = 60;
const NONE = 'none'; // 선택한 일정 카드를 닫은 상태

const LEGEND = [
  ['fixed', '고정 시간'],
  ['task', '작업'],
  ['routine', '루틴'],
  ['daily', '일정'],
  ['break', '휴식'],
  ['sleep', '수면'],
];

export default function CalendarPage({ nav }) {
  const [view, setView] = useState('week');
  const [selected, setSelected] = useState(() => new Date());
  const schedule = useLiveSchedule(selected, view);
  const rescheduling = useRescheduling();
  const details = useBlockDetails();
  const [pickedId, setPickedId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const swipeStart = useRef(null);
  const cardRef = useRef(null);
  const now = new Date();

  // 왼쪽으로 밀면 다음 주, 오른쪽으로 밀면 이전 주 (같은 요일 유지)
  const onSwipeEnd = (e) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setSelected((d) => addDays(d, dx < 0 ? 7 : -7));
    setPickedId(null);
  };

  const blocks = schedule.blocksForDate(selected);
  // 선택한 블록이 없으면 지금 하는 작업, 없으면 그날 첫 작업을 보여 준다
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tasks = blocks.filter((b) => b.kind === 'task');
  const picked =
    pickedId === NONE
      ? undefined
      : blocks.find((b) => b.id === pickedId) ??
        (isSameDay(selected, now)
          ? tasks.find((b) => toMinutes(b.end) > nowMin)
          : tasks[0]);
  // 직접 고른 블록의 카드는 선택을 해제할 때까지 화면 아래에 고정한다
  const pinned = !!picked && picked.id === pickedId;

  // 시트는 id만 기억하고 최신 일정에서 다시 찾는다 (수정·삭제 뒤 바로 반영되고, 지워진 일정이면 닫힌다)
  const detailBlock = blocks.find((b) => b.id === detailId);

  const pickedDone = picked && (picked.status === 'done' || details.statusOf(picked.id) === 'done');
  // 서버는 시작 전 블록의 종료 보고를 받지 않는다
  const pickedStarted = (() => {
    if (!picked) return false;
    const begin = new Date(selected);
    begin.setHours(0, toMinutes(picked.start), 0, 0);
    return begin <= now;
  })();
  // 블록을 누르면 화면 밖에 있던 선택 카드가 보이도록 스크롤한다
  useEffect(() => {
    if (pickedId) cardRef.current?.scrollIntoView({ block: 'nearest' });
  }, [pickedId]);

  const priority = picked?.kind === 'task' ? priorityOf(picked.task) : null;

  return (
    <div className="d-page calendar-page">
      <header className="d-header">
        <div>
          <p className="d-sub">캘린더 · {formatClock(now)}</p>
          <h1 className="d-title">{formatLongDate(selected)}</h1>
        </div>
        <button type="button" className="d-icon-btn" aria-label="추가하기" onClick={() => nav.open('add')}>
          <PlusIcon size={20} />
        </button>
      </header>

      {schedule.error && (
        <p className="d-alert" role="alert">
          일정을 불러오지 못했어요. ({schedule.error})
        </p>
      )}

      {/* 재배치 중에는 서버가 조회를 미뤄 빈 화면이 되므로 무엇을 기다리는지 알려 준다 */}
      {(rescheduling || (schedule.loading && !schedule.days.length)) && (
        <p className="calendar-loading" role="status">
          <i className="spinner" aria-hidden="true" />
          {rescheduling ? '리스케쥴링 중이에요. 새 일정을 곧 보여 드릴게요…' : '일정을 불러오는 중이에요…'}
        </p>
      )}

      <div className="calendar-toolbar">
        <div className="segmented">
          {[
            ['week', '주'],
            ['month', '월'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={view === id ? 'is-active' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <MonthGrid
          year={selected.getFullYear()}
          month={selected.getMonth()}
          selected={selected}
          onSelect={(day) => {
            setSelected(day);
            setPickedId(null);
            setView('week');
          }}
          blocksForDate={schedule.blocksForDate}
        />
      ) : (
      <>
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
        <WeekStrip
          selected={selected}
          blocksForDate={schedule.blocksForDate}
          onSelect={(day) => {
            setSelected(day);
            setPickedId(null);
          }}
        />
      </div>

      <div className="legend" aria-label="범례">
        {LEGEND.map(([kind, label]) => (
          <span key={kind}>
            <i className={`legend-swatch is-${kind}`} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      <DayTimetable
        date={selected}
        blocks={blocks}
        selectedId={picked?.id}
        onSelectBlock={(b) => setPickedId(b.id === pickedId ? NONE : b.id)} // 같은 블록을 다시 누르면 선택 해제
        statusOf={details.statusOf}
      />

      {picked && (
        <section ref={cardRef} className={`d-card picked ${pinned ? 'is-pinned' : ''}`} aria-label="선택한 일정">
          <div className="picked-head">
            <div>
              <h2>{picked.title}</h2>
              <p className="d-meta">
                {picked.start} – {picked.end} ·{' '}
                {picked.kind === 'task'
                  ? picked.task?.title ?? '작업'
                  : picked.location ?? '고정 시간'}
              </p>
            </div>
            <div className="picked-side">
              {priority && <span className={`d-chip is-${priority.tone}`}>{priority.label}</span>}
              {pinned && (
                <button type="button" className="picked-close" aria-label="선택 해제" onClick={() => setPickedId(NONE)}>
                  ✕
                </button>
              )}
            </div>
          </div>
          {picked.task?.subtasks?.length > 0 && (
            <p className="picked-desc">{picked.task.subtasks.map((s) => s.title).join(' · ')}</p>
          )}
          {picked.kind === 'task' ? (
            <div className="picked-actions">
              <button type="button" className="d-btn d-btn-line" onClick={() => setDetailId(picked.id)}>
                자세히
              </button>
              <button
                type="button"
                className="d-btn d-btn-dark"
                disabled={pickedDone || !pickedStarted}
                onClick={() => nav.finish({ block: picked, blocks, taskById: schedule.taskById })}
              >
                <StopIcon size={14} />
                {pickedDone ? '종료한 작업' : pickedStarted ? '작업 종료' : '아직 시작 전'}
              </button>
            </div>
          ) : (
            <button type="button" className="d-btn d-btn-line" onClick={() => setDetailId(picked.id)}>
              자세히 보기
            </button>
          )}
        </section>
      )}

      </>
      )}

      {detailBlock && <BlockDetailSheet block={detailBlock} details={details} onClose={() => setDetailId(null)} />}
    </div>
  );
}
