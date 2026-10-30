import { useRef, useState } from 'react';
import WeekStrip from '../components/calendar/WeekStrip.jsx';
import DayTimetable from '../components/calendar/DayTimetable.jsx';
import BlockDetailSheet from '../components/calendar/BlockDetailSheet.jsx';
import { PlusIcon, StopIcon } from '../components/common/Icons.jsx';
import useBlockDetails from '../hooks/useBlockDetails.js';
import useLiveSchedule from '../hooks/useLiveSchedule.js';
import { addDays, isSameDay } from '../utils/calendar.js';
import { toMinutes } from '../utils/time.js';
import { priorityOf, FIXED_KIND_LABEL, formatLongDate, formatClock } from '../utils/labels.js';

const SWIPE_MIN_PX = 60;

const LEGEND = [
  ['fixed', '수업·알바'],
  ['task', '작업'],
  ['routine', '루틴'],
  ['break', '휴식'],
];

export default function CalendarPage({ nav }) {
  const [selected, setSelected] = useState(() => new Date());
  const schedule = useLiveSchedule(selected);
  const details = useBlockDetails();
  const [pickedId, setPickedId] = useState(null);
  const [detailBlock, setDetailBlock] = useState(null);
  const swipeStart = useRef(null);
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
    blocks.find((b) => b.id === pickedId) ??
    (isSameDay(selected, now)
      ? tasks.find((b) => toMinutes(b.end) > nowMin)
      : tasks[0]);

  const pickedDone = picked && (picked.status === 'done' || details.statusOf(picked.id) === 'done');
  // 서버는 시작 전 블록의 종료 보고를 받지 않는다
  const pickedStarted = (() => {
    if (!picked) return false;
    const begin = new Date(selected);
    begin.setHours(0, toMinutes(picked.start), 0, 0);
    return begin <= now;
  })();
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
        onSelectBlock={(b) => setPickedId(b.id)}
        statusOf={details.statusOf}
      />

      {picked && (
        <section className="d-card picked" aria-label="선택한 일정">
          <div className="picked-head">
            <div>
              <h2>{picked.title}</h2>
              <p className="d-meta">
                {picked.start} – {picked.end} ·{' '}
                {picked.kind === 'task'
                  ? picked.task?.title ?? '작업'
                  : picked.location ?? FIXED_KIND_LABEL[picked.fixedKind] ?? '고정 일정'}
              </p>
            </div>
            {priority && <span className={`d-chip is-${priority.tone}`}>{priority.label}</span>}
          </div>
          {picked.task?.subtasks?.length > 0 && (
            <p className="picked-desc">{picked.task.subtasks.map((s) => s.title).join(' · ')}</p>
          )}
          {picked.kind === 'task' ? (
            <div className="picked-actions">
              <button type="button" className="d-btn d-btn-line" onClick={() => setDetailBlock(picked)}>
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
            <button type="button" className="d-btn d-btn-line" onClick={() => setDetailBlock(picked)}>
              자세히 보기
            </button>
          )}
        </section>
      )}

      {detailBlock && <BlockDetailSheet block={detailBlock} details={details} onClose={() => setDetailBlock(null)} />}
    </div>
  );
}
