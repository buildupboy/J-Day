import { useState } from 'react';
import { api } from '../../api/client.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';
import { queueReschedule, cancelQueuedReschedule, EDIT_DELAY_MS } from '../../hooks/useDeferredReschedule.js';
import { offerUndo, markPending, notify } from '../../hooks/useUndo.js';
import { formatDuration } from '../../utils/time.js';
import { ChevronIcon } from '../common/Icons.jsx';
import DeadlineInput from '../tasks/DeadlineInput.jsx';
import { BEFORE_DEADLINE, remindersOf, splitIso, joinIso } from '../../utils/reminder.js';
import { toIsoDate } from '../../utils/parseTaskText.js';
import { useAppDialogs } from '../common/AppDialogs.jsx';

const toLocalInput = (iso) => (iso ? iso.slice(0, 16) : '');
const fromLocalInput = (value) => `${value}:00+09:00`;

const IMPORTANCE_OPTIONS = [
  [3, 'Must'],
  [2, 'Should'],
  [1, 'Could'],
];

// 서버 호출 후 일정을 다시 불러온다. 실패하면 메시지를 돌려준다.
async function run(action) {
  try {
    await action();
    scheduleChanged();
    return '';
  } catch (error) {
    return error.message;
  }
}

// 배치에 영향을 주는 수정을 저장한 뒤 부른다 (메모·알림은 제외).
// 30초 뒤 재배치 카운트다운을 걸고, 실행 취소하면 수정을 되돌리면서 그 재배치도 취소한다
function afterScheduleEdit(message, revert) {
  const request = queueReschedule({ delayMs: EDIT_DELAY_MS, reason: 'manual' });
  offerUndo({
    message,
    undo: async () => {
      await revert();
      scheduleChanged();
      cancelQueuedReschedule(request);
    },
  });
}

// 상위 작업의 제목·마감·중요도 수정 폼
export function TaskEditForm({ task, onDone }) {
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(toLocalInput(task.deadline));
  const [importance, setImportance] = useState(task.importance ?? 2);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !deadline) {
      setError('제목과 마감을 입력해 주세요.');
      return;
    }
    setSaving(true);
    const before = { title: task.title, deadline: task.deadline, importance: task.importance ?? 2 };
    const message = await run(() =>
      api.updateTask(task.id, { title: title.trim(), deadline: fromLocalInput(deadline), importance: Number(importance) }),
    );
    setSaving(false);
    if (message) setError(message);
    else {
      afterScheduleEdit(`'${before.title}' 작업을 수정했어요`, () => api.updateTask(task.id, before));
      onDone();
    }
  };

  return (
    <div className="edit-form">
      <label>
        제목
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      </label>
      <label>
        마감
        <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      <label>
        중요도
        <select value={importance} onChange={(e) => setImportance(e.target.value)}>
          {IMPORTANCE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="edit-actions">
        <button type="button" className="action-button" onClick={onDone} disabled={saving}>
          취소
        </button>
        <button type="button" className="action-button action-primary" onClick={save} disabled={saving}>
          저장
        </button>
      </div>
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="d-switch" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

// 알림 설정: 직접 고른 날짜·시간(스크롤 휠) 아래에 마감 하루·1시간·30분 전 토글을 나열한다
export function ReminderField({ task }) {
  const reminders = remindersOf(task);
  const custom = reminders.find((reminder) => reminder.mode === 'at');
  const [error, setError] = useState('');
  // 알림 토글: 끄면 접히고 설정한 알림이 모두 지워진다. 켜면 세부 설정이 펼쳐진다.
  const [open, setOpen] = useState(reminders.length > 0);
  // 켠 채로 세부 설정만 접어 둘 수 있다
  const [folded, setFolded] = useState(true);

  const save = async (next) => {
    setError('');
    // 알림을 켜는 순간 브라우저 알림 권한을 요청한다
    if (next.length && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    setError(await run(() => api.updateTask(task.id, { reminders: next })));
  };

  const toggleBefore = (minutes, on) => {
    const rest = reminders.filter((reminder) => reminder.mode === 'at' || reminder.minutes !== minutes);
    save(on ? [...rest, { mode: 'beforeDeadline', minutes }] : rest);
  };

  const setCustom = (at) => save([...reminders.filter((reminder) => reminder.mode !== 'at'), ...(at ? [{ mode: 'at', at }] : [])]);

  // 직접 설정을 처음 켜면 오늘 다음 정각(마감보다 늦으면 마감 시각)으로 시작한다
  const turnOnCustom = () => {
    const next = new Date();
    next.setHours(next.getHours() + 1, 0, 0, 0);
    const fallback = joinIso(toIsoDate(next), `${String(next.getHours()).padStart(2, '0')}:00`);
    setCustom(Date.parse(fallback) < Date.parse(task.deadline) ? fallback : task.deadline);
  };

  const parts = custom ? splitIso(custom.at) : null;

  const toggleOpen = async (on) => {
    if (on) {
      setFolded(false);
      return setOpen(true);
    }
    if (reminders.length) await save([]);
    return setOpen(false);
  };

  return (
    <div className="reminder-box">
      <div className="reminder-master">
        {open ? (
          <button type="button" className="reminder-fold" aria-expanded={!folded} onClick={() => setFolded((v) => !v)}>
            알림
            <small>{folded && reminders.length ? `${reminders.length}개 설정됨` : ''}</small>
            <span className={folded ? '' : 'is-open'}>
              <ChevronIcon size={16} />
            </span>
          </button>
        ) : (
          <span>알림</span>
        )}
        <Switch checked={open} label="알림" onChange={toggleOpen} />
      </div>
      {open && !folded && (
        <>
      <div className="switch-row">
        <div>
          <p className="switch-title">알림 시간 직접 설정</p>
          <p className="d-meta">{parts ? `${parts.date.replaceAll('-', '. ')}. ${parts.time}` : '날짜와 시간을 골라요'}</p>
        </div>
        <Switch checked={!!custom} label="알림 시간 직접 설정" onChange={(on) => (on ? turnOnCustom() : setCustom(null))} />
      </div>
      {parts && (
        <DeadlineInput
          showPreview={false}
          date={parts.date}
          time={parts.time}
          onDateChange={(date) => setCustom(joinIso(date, parts.time))}
          onTimeChange={(time) => setCustom(joinIso(parts.date, time))}
        />
      )}
      {BEFORE_DEADLINE.map(({ minutes, label }) => (
        <div className="switch-row" key={minutes}>
          <p className="switch-title">{label}</p>
          <Switch
            checked={reminders.some((reminder) => reminder.mode === 'beforeDeadline' && reminder.minutes === minutes)}
            label={label}
            onChange={(on) => toggleBefore(minutes, on)}
          />
        </div>
      ))}
        </>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// 하위 작업 한 줄 (시간 옆에 수정·삭제). 수정 중이면 입력칸으로 바뀐다.
export function SubtaskRow({ task, subtask, done, highlighted, onToggle }) {
  const { confirm } = useAppDialogs();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(subtask.title);
  const [minutes, setMinutes] = useState(String(subtask.estimatedMinutes));
  const [error, setError] = useState('');

  const save = async () => {
    const value = Number(minutes);
    if (!title.trim() || !Number.isInteger(value) || value < 0) {
      setError('이름과 소요 시간(분)을 확인해 주세요.');
      return;
    }
    const before = { title: subtask.title, estimatedMinutes: subtask.estimatedMinutes };
    const message = await run(() => api.updateSubtask(task.id, subtask.id, { title: title.trim(), estimatedMinutes: value }));
    if (message) setError(message);
    else {
      afterScheduleEdit(`'${before.title}' 하위 작업을 수정했어요`, () => api.updateSubtask(task.id, subtask.id, before));
      setEditing(false);
    }
  };

  const remove = async () => {
    if (!(await confirm(`‘${subtask.title}’ 하위 작업을 삭제할까요?`))) return;
    // 실행 취소를 기다린 뒤 보낸다 (다시 추가하면 순서가 바뀌므로 미뤄서 지운다)
    const key = `subtask:${subtask.id}`;
    markPending(key, true);
    const request = queueReschedule({ delayMs: EDIT_DELAY_MS, reason: 'manual' });
    offerUndo({
      message: `'${subtask.title}' 하위 작업을 삭제했어요`,
      undo: () => {
        markPending(key, false);
        cancelQueuedReschedule(request);
      },
      commit: async () => {
        const message = await run(() => api.deleteSubtask(task.id, subtask.id));
        if (message) {
          markPending(key, false);
          notify(`삭제하지 못했어요. ${message}`);
        }
      },
    });
  };

  if (editing) {
    return (
      <li className="subtask-edit">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="하위 작업 이름" />
        <input
          type="number"
          min="0"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          aria-label="소요 시간(분)"
          className="minutes-input"
        />
        <span>분</span>
        <button type="button" className="mini-button is-primary" onClick={save}>
          저장
        </button>
        <button type="button" className="mini-button" onClick={() => setEditing(false)}>
          취소
        </button>
        {error && (
          <small className="field-error" role="alert">
            {error}
          </small>
        )}
      </li>
    );
  }

  return (
    <li>
      <label>
        <input type="checkbox" checked={done} onChange={onToggle} />
        <span className={done ? 'is-done' : ''}>{subtask.title}</span>
        <em>{formatDuration(subtask.estimatedMinutes)}</em>
        <button type="button" className="mini-button" onClick={(e) => { e.preventDefault(); setEditing(true); }}>
          수정
        </button>
        <button type="button" className="mini-button is-danger" onClick={(e) => { e.preventDefault(); remove(); }}>
          삭제
        </button>
      </label>
      {highlighted && <small>이 시간에 할 일</small>}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </li>
  );
}

// 하위 작업 직접 추가 폼 (+ 버튼으로 열린다)
export function SubtaskAddForm({ task, onDone }) {
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [error, setError] = useState('');

  const add = async () => {
    const value = Number(minutes);
    if (!title.trim() || !Number.isInteger(value) || value < 0) {
      setError('이름과 소요 시간(분)을 확인해 주세요.');
      return;
    }
    let added;
    const message = await run(async () => {
      added = (await api.addSubtask(task.id, { title: title.trim(), estimatedMinutes: value })).subtask;
    });
    if (message) setError(message);
    else {
      afterScheduleEdit(`'${added.title}' 하위 작업을 추가했어요`, () => api.deleteSubtask(task.id, added.id));
      onDone();
    }
  };

  return (
    <div className="subtask-edit subtask-add">
      <input
        type="text"
        value={title}
        placeholder="하위 작업 이름"
        onChange={(e) => setTitle(e.target.value)}
        aria-label="새 하위 작업 이름"
        autoFocus
      />
      <input
        type="number"
        min="0"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        aria-label="소요 시간(분)"
        className="minutes-input"
      />
      <span>분</span>
      <button type="button" className="mini-button is-primary" onClick={add}>
        추가
      </button>
      <button type="button" className="mini-button" onClick={onDone}>
        취소
      </button>
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 고정 시간·루틴 수정 폼. 요일이 반복되는 원본을 고치므로 모든 반복에 적용된다.
export function FixedEditForm({ block, onDone }) {
  const [title, setTitle] = useState(block.title);
  const [location, setLocation] = useState(block.location ?? '');
  const [start, setStart] = useState(block.start);
  const [end, setEnd] = useState(block.end);
  const [days, setDays] = useState(block.dayOfWeek ?? []);
  const [date, setDate] = useState(block.fixedDate ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleDay = (day) => setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));

  const save = async () => {
    if (!title.trim() || !days.length || !start || !end || start >= end) {
      setError('이름, 요일, 시작·종료 시간을 확인해 주세요.');
      return;
    }
    setSaving(true);
    const message = await run(() =>
      api.updateFixedBlock(block.id, { title: title.trim(), location, start, end, ...(block.fixedDate ? { date } : { dayOfWeek: days }) }),
    );
    setSaving(false);
    if (message) setError(message);
    else onDone();
  };

  return (
    <div className="edit-form">
      <label>
        이름
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
      </label>
      {block.fixedKind !== 'routine' && (
        <label>
          메모
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={150} />
        </label>
      )}
      <div className="edit-time-row">
        <label>
          시작
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          종료
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {block.fixedDate ? <label>날짜<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label> : <div className="day-chips" role="group" aria-label="반복 요일">
        {WEEKDAYS.map((label, day) => (
          <button key={label} type="button" aria-pressed={days.includes(day)} onClick={() => toggleDay(day)}>
            {label}
          </button>
        ))}
      </div>}
      <p className="d-meta">{block.fixedDate ? '지정한 날짜의 일정에만 적용돼요.' : '모든 반복 일정에 적용돼요.'}</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="edit-actions">
        <button type="button" className="action-button" onClick={onDone} disabled={saving}>
          취소
        </button>
        <button type="button" className="action-button action-primary" onClick={save} disabled={saving}>
          저장
        </button>
      </div>
    </div>
  );
}

// 메모: 저장된 메모를 보여 주고 '수정'을 누르면 입력칸이 열린다. 저장하면 서버에 반영된다.
function MemoBox({ title, placeholder, saved, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const open = () => {
    setDraft(saved);
    setError('');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    const message = await run(() => onSave(draft));
    setSaving(false);
    if (message) setError(message);
    else setEditing(false);
  };

  return (
    <div className="detail-section">
      <div className="memo-head">
        <h3>{title}</h3>
        {!editing && (
          <button type="button" className="mini-button" onClick={open}>
            {saved ? '수정' : '추가'}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            className="memo-input"
            rows={3}
            maxLength={1000}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <div className="edit-actions memo-actions">
            <button type="button" className="action-button" onClick={() => setEditing(false)} disabled={saving}>
              취소
            </button>
            <button type="button" className="action-button action-primary" onClick={save} disabled={saving}>
              저장
            </button>
          </div>
        </>
      ) : (
        <p className={`memo-text ${saved ? '' : 'is-empty'}`}>{saved || placeholder}</p>
      )}
    </div>
  );
}

export function TaskMemo({ task }) {
  return (
    <MemoBox
      title="작업 메모"
      placeholder="이 작업에 대한 메모를 남겨 보세요"
      saved={task.memo ?? ''}
      onSave={(memo) => api.updateTask(task.id, { memo })}
    />
  );
}

export function FixedMemo({ block }) {
  return (
    <MemoBox
      title="메모"
      placeholder="이 일정에 대한 메모를 남겨 보세요"
      saved={block.memo ?? ''}
      onSave={(memo) => api.updateFixedBlock(block.id, { memo })}
    />
  );
}

// 미루기: "언제로 미룰까요?" 날짜·시간을 골라 그 시각으로 블록을 옮긴다
export function PostponeForm({ block, onCancel, onDone }) {
  const blockIds = block.parts ? block.parts.map((part) => part.id) : [block.id];
  const nextDay = toIsoDate(new Date(new Date(`${block.date}T00:00:00`).getTime() + 86400000));
  const blockStart = new Date(`${block.date}T${block.start}:00`);
  const oneHourLater = new Date(blockStart.getTime() + 3600000);
  // 처음에는 지금 잡혀 있는 시각 그대로 보여 주고, 버튼이나 휠로 옮길 시각을 고른다
  const [date, setDate] = useState(block.date);
  const [time, setTime] = useState(block.start);
  const unchanged = date === block.date && time === block.start;
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const quick = (label, at) => (
    <button
      type="button"
      className="mini-button"
      onClick={() => {
        setDate(toIsoDate(at));
        setTime(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`);
      }}
    >
      {label}
    </button>
  );

  const save = async () => {
    setSaving(true);
    const message = await run(() => api.postponeBlocks({ blockIds, date, start: time }));
    setSaving(false);
    if (message) setError(message);
    else onDone();
  };

  return (
    <div className="postpone-form">
      <p className="postpone-title">언제로 미룰까요?</p>
      <div className="postpone-quick">
        {quick('1시간 뒤', oneHourLater)}
        {quick('내일 같은 시간', new Date(`${nextDay}T${block.start}:00`))}
        {quick('모레 같은 시간', new Date(new Date(`${nextDay}T${block.start}:00`).getTime() + 86400000))}
      </div>
      <DeadlineInput date={date} time={time} onDateChange={setDate} onTimeChange={setTime} showPreview={false} />
      <p className="d-meta">고른 시각부터 같은 길이로 옮기고, 원래 자리는 비워 둬요.</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="edit-actions">
        <button type="button" className="action-button" onClick={onCancel} disabled={saving}>
          취소
        </button>
        <button type="button" className="action-button action-primary" onClick={save} disabled={saving || unchanged}>
          미루기
        </button>
      </div>
    </div>
  );
}
