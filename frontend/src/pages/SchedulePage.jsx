import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { PlusIcon, MicIcon, ImageIcon } from '../components/common/Icons.jsx';
import { getWeekDays, addDays, WEEKDAY_LABELS } from '../utils/calendar.js';
import { toMinutes, formatDuration } from '../utils/time.js';
import { priorityOf, TASK_TYPE_LABEL, FIXED_KIND_LABEL, daysUntil, dDay } from '../utils/labels.js';
import { toIsoDate } from '../utils/parseTaskText.js';
import BlockDetailSheet from '../components/calendar/BlockDetailSheet.jsx';
import useBlockDetails from '../hooks/useBlockDetails.js';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';
import useTimetableEmployee from '../hooks/useTimetableEmployee.jsx';

const SHORT_WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 화면은 월요일부터, dayOfWeek는 0=일

// 03 일정 탭: 다가오는 일정 / 시간표·루틴
export default function SchedulePage({ nav, view, onViewChange }) {
  return (
    <div className="d-page">
      <header className="d-header is-center">
        <h1 className="d-title">일정</h1>
        <button type="button" className="d-icon-btn" aria-label="추가하기" onClick={() => nav.open('add')}>
          <PlusIcon size={20} />
        </button>
      </header>

      <nav className="d-segment" aria-label="일정 보기">
        {[
          ['upcoming', '다가오는 일정'],
          ['setup', '시간표 · 루틴'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? 'page' : undefined}
            className={view === id ? 'is-on' : ''}
            onClick={() => onViewChange(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === 'setup' ? <SetupView nav={nav} /> : <UpcomingView nav={nav} />}
    </div>
  );
}

// 마감 날짜로 묶는다: 이번 주 · 다음 주 · 그 뒤는 달별
function groupOf(deadline, today) {
  const week = getWeekDays(today);
  const iso = deadline.slice(0, 10);
  if (iso <= toIsoDate(week[6])) return '이번 주';
  if (iso <= toIsoDate(addDays(week[6], 7))) return '다음 주';
  return `${Number(iso.slice(5, 7))}월`;
}

function UpcomingView({ nav }) {
  const [tasks, setTasks] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const details = useBlockDetails();

  useEffect(() => {
    let active = true;
    const load = () =>
      Promise.all([api.getTasks(), api.getFixedBlocks()])
        .then(([taskList, fixed]) => {
          if (!active) return;
          setTasks(taskList);
          setEvents(fixed.filter((b) => b.kind === 'event' && b.date));
          setError('');
        })
        .catch((err) => active && setError(err.message));
    load();
    window.addEventListener('schedule-changed', load);
    return () => {
      active = false;
      window.removeEventListener('schedule-changed', load);
    };
  }, []);

  const today = new Date();
  // 마감이 남은 작업과 하루짜리 일정을 날짜·시각 순으로 함께 보여 준다
  const upcoming = [
    ...(tasks ?? []).filter((t) => t.status !== 'done' && daysUntil(t.deadline, today) >= 0).map((t) => ({ ...t, at: t.deadline.slice(0, 16) })),
    ...events.filter((e) => daysUntil(e.date, today) >= 0).map((e) => ({ ...e, isEvent: true, deadline: e.date, at: `${e.date}T${e.start}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const groups = [];
  for (const task of upcoming) {
    const name = groupOf(task.deadline, today);
    const group = groups.find((g) => g.name === name) ?? groups[groups.push({ name, items: [] }) - 1];
    group.items.push(task);
  }

  return (
    <>
      <button type="button" className="voice-hint" onClick={() => nav.open('voice')}>
        <MicIcon size={18} />
        “금요일까지 과제, 2시간쯤 걸려”처럼 말해서 추가
      </button>

      {error && (
        <p className="d-alert" role="alert">
          일정을 불러오지 못했어요. ({error})
        </p>
      )}
      {!tasks && !error && <p className="d-empty">불러오는 중이에요…</p>}
      {tasks && upcoming.length === 0 && (
        <div className="d-empty-card">
          <p>다가오는 마감이 없어요.</p>
          <button type="button" className="d-btn d-btn-dark" onClick={() => nav.open('addTask')}>
            작업 추가하기
          </button>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.name} className="up-group" aria-label={group.name}>
          <h2>{group.name}</h2>
          {group.items.map((task) => {
            const date = new Date(`${task.deadline.slice(0, 10)}T00:00:00`);
            if (task.isEvent) {
              return (
                <div key={task.id} className="up-row">
                  <div className="up-date">
                    <strong>{date.getDate()}</strong>
                    <span>{SHORT_WEEKDAY[date.getDay()]}</span>
                  </div>
                  <div className="up-body">
                    <p className="up-title">{task.title}</p>
                    <p className="up-meta">
                      일정 · {task.start} – {task.openEnd ? '끝 시간 미정' : task.end}
                    </p>
                  </div>
                  <span className="d-badge">{dDay(daysUntil(task.date, today))}</span>
                </div>
              );
            }
            const priority = priorityOf(task);
            const must = priority.tone === 'must';
            const left = daysUntil(task.deadline, today);
            return (
              <button key={task.id} type="button" className={`up-row ${must ? 'is-key' : ''}`} onClick={() => setSelectedTask(task)} aria-label={`${task.title} 상세 보기`}>
                <div className="up-date">
                  <strong>{date.getDate()}</strong>
                  <span>{SHORT_WEEKDAY[date.getDay()]}</span>
                </div>
                <div className="up-body">
                  <p className="up-title">{task.title}</p>
                  <p className="up-meta">
                    {TASK_TYPE_LABEL[task.type] ?? '작업'} · {priority.label} · 예상 {formatDuration(task.estimatedMinutes ?? 0)}
                    {task.progress > 0 && ` · ${Math.round(task.progress * 100)}% 진행`}
                  </p>
                </div>
                <span className={`d-badge ${must ? 'is-solid' : ''}`}>{dDay(left)}</span>
              </button>
            );
          })}
        </section>
      ))}
      {selectedTask && <UpcomingDetail key={selectedTask.id} task={selectedTask} details={details} onClose={() => setSelectedTask(null)} />}
    </>
  );
}

function UpcomingDetail({ task, details, onClose }) {
  const [state, setState] = useState({ loading: true, block: null, error: '' });
  useEffect(() => {
    let active = true;
    async function load() {
      const today = toIsoDate(new Date());
      try {
        for (let from = new Date(`${today}T00:00:00`); toIsoDate(from) <= task.deadline.slice(0, 10); from = addDays(from, 7)) {
          const week = await api.getWeekSchedule(toIsoDate(from));
          if (!active) return;
          const matches = week.days.flatMap((day) => day.items
            .filter((item) => item.source === 'scheduled' && item.taskId === task.id)
            .map((item) => ({ ...item, date: day.date, kind: 'task', task }))
          ).sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
          const block = matches.find((item) => item.status !== 'done' && item.status !== 'missed') ?? matches[0];
          if (block) {
            setState({ loading: false, block, error: '' });
            return;
          }
        }
        if (active) setState({ loading: false, block: { id: task.id, taskId: task.id, title: task.title, kind: 'task', task }, error: '' });
      } catch (error) {
        if (active) setState({ loading: false, block: null, error: error.message });
      }
    }
    load();
    return () => { active = false; };
  }, [task]);
  if (state.block) return <BlockDetailSheet block={state.block} details={details} onClose={onClose} />;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet sheet-auto" role="dialog" aria-modal="true" aria-label={`${task.title} 상세`} onClick={(event) => event.stopPropagation()}>
        <div className="sheet-head"><h2>{task.title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="닫기">✕</button></div>
        {state.loading ? <p role="status">작업 일정을 불러오는 중이에요…</p> : <p role="alert">일정을 불러오지 못했어요. ({state.error})</p>}
      </section>
    </div>
  );
}

function SetupView({ nav }) {
  const { chooseEmployee, employeeDialog } = useTimetableEmployee();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState(() => new Date().getDay());
  const photoInput = useRef(null);
  const importing = useRef(false);
  const [importStatus, setImportStatus] = useState('');

  async function importPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing.current) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      nav.importFailed({ error: '10MB 이하의 PNG, JPG, WebP 사진을 선택해 주세요.' });
      return;
    }
    importing.current = true;
    setImportStatus('시간표 분석 중…');
    const photo = URL.createObjectURL(file);
    let draft = null;
    try {
      const result = await chooseEmployee(await api.extractTimetable(photo));
      if (!result) return;
      draft = result;
      if (result.requiresReview) throw new Error([...result.reviewReasons, ...result.warnings].join(' ') || '요일과 시간을 확인해 주세요. 자동 저장하지 않았어요.');
      if (!result.lessons?.length) throw new Error('등록할 고정 일정을 찾지 못했어요. 요일과 시간이 잘 보이는 사진을 선택해 주세요.');
      setImportStatus('시간표 저장 중…');
      await api.saveTimetable(result.lessons, result.visibleDays ?? [], { clearExisting: true });
      scheduleChanged();
    } catch (err) {
      nav.importFailed({ error: err.message, file, draft });
    } finally {
      URL.revokeObjectURL(photo);
      importing.current = false;
      setImportStatus('');
    }
  }

  useEffect(() => {
    let active = true;
    const load = () => api
      .getTimetable()
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err.message));
    load();
    window.addEventListener('schedule-changed', load);
    return () => {
      active = false;
      window.removeEventListener('schedule-changed', load);
    };
  }, []);

  const all = data ? [...data.lessons, ...data.otherBlocks] : [];
  const fixed = all
    .filter((b) => b.kind !== 'routine' && b.dayOfWeek.includes(day) && b.start && b.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  const routines = all.filter((b) => b.kind === 'routine').sort((a, b) => a.start.localeCompare(b.start));

  return (
    <>
      <section className="d-section" aria-label="고정 시간표">
        {employeeDialog}
        <div className="d-section-head">
          <h2>고정 시간표</h2>
          <span className="d-meta">요일별 일정</span>
        </div>
        <div className="day-picker" role="group" aria-label="요일">
          {DAY_ORDER.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={day === d}
              className={day === d ? 'is-on' : ''}
              onClick={() => setDay(d)}
            >
              {WEEKDAY_LABELS[i]}
            </button>
          ))}
        </div>
        {error && (
          <p className="d-alert" role="alert">
            {error}
          </p>
        )}
        {data && (
          <ul className="d-card d-list fixed-list">
            {fixed.length === 0 && <li className="fixed-empty">이 요일엔 고정 일정이 없어요.</li>}
            {fixed.map((b) => (
              <li key={b.id}>
                <span className="fixed-time">
                  {b.start} – {b.end}
                </span>
                <span className="fixed-title">{b.date && `${b.date} · `}{b.title}</span>
                <span className="d-meta">{FIXED_KIND_LABEL[b.kind] ?? '일정'}</span>
              </li>
            ))}
          </ul>
        )}
        {!data && !error && <p className="d-empty">불러오는 중이에요…</p>}
        <div className="d-grid-2">
          <input ref={photoInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={importPhoto} />
          <button type="button" className="d-btn d-btn-line" disabled={!!importStatus} aria-busy={!!importStatus} onClick={() => photoInput.current?.click()}>
            <ImageIcon size={18} />
            {importStatus || '캡처로 불러오기'}
          </button>
          <button type="button" className="d-btn d-btn-line" onClick={() => nav.open('voice')}>
            <MicIcon size={18} />
            말로 추가
          </button>
        </div>
      </section>


      <section className="d-section" aria-label="루틴">
        <h2 className="d-h2">루틴</h2>
        {data && (
          <ul className="d-card d-list">
            {routines.length === 0 && <li className="fixed-empty">등록된 루틴이 없어요.</li>}
            {routines.map((r) => (
              <li key={r.id} className="routine-item">
                <div className="routine-head">
                  <span>{r.title}</span>
                  <span className="d-meta">
                    {r.start} · {formatDuration(toMinutes(r.end) - toMinutes(r.start))}
                  </span>
                </div>
                <div className="routine-days" aria-label={DAY_ORDER.filter((d) => r.dayOfWeek.includes(d)).map((d) => SHORT_WEEKDAY[d]).join('·')}>
                  {DAY_ORDER.map((d, i) => (
                    <span key={d} className={r.dayOfWeek.includes(d) ? 'is-on' : ''}>
                      {WEEKDAY_LABELS[i]}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="voice-hint" onClick={() => nav.open('voice')}>
          <MicIcon size={18} />
          “평일 7시에 일어나서 30분 독서”처럼 말해서 추가
        </button>
      </section>
    </>
  );
}
