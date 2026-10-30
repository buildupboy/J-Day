import { useState } from 'react';
import DateTimeRows from '../components/common/DateTimeRows.jsx';
import MemoField from '../components/common/MemoField.jsx';
import { CloseIcon, MicIcon } from '../components/common/Icons.jsx';
import { toIsoDate } from '../utils/parseTaskText.js';
import { api } from '../api/client.js';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';

const REPEATS = [
  ['none', '안 함'],
  ['weekly', '매주'],
  ['daily', '매일'],
];

// 02-2 일정 등록: 시간이 정해진 약속·예약·시험을 고정 일정으로 넣는다 (POST /api/fixed-blocks).
// 항상 '일정'(event)으로 저장한다. 반복 '안 함'은 그날 하루만, '매주'·'매일'은 해당 요일마다 반복한다.
export default function NewEventPage({ nav, onClose }) {
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(() => toIsoDate(new Date()));
  const [start, setStart] = useState('14:00');
  const [endDate, setEndDate] = useState(() => toIsoDate(new Date()));
  const [end, setEnd] = useState('15:00');
  const [openEnd, setOpenEnd] = useState(false);
  const [repeat, setRepeat] = useState('none');
  const [memo, setMemo] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 시작을 바꿔 종료보다 늦어지면 종료를 시작 1시간 뒤로 옮긴다 (iOS 캘린더와 같은 동작)
  const moveStart = (nextDate, nextTime) => {
    setStartDate(nextDate);
    setStart(nextTime);
    if (`${endDate}T${end}` <= `${nextDate}T${nextTime}`) {
      const after = new Date(`${nextDate}T${nextTime}:00`);
      after.setHours(after.getHours() + 1);
      setEndDate(toIsoDate(after));
      setEnd(`${String(after.getHours()).padStart(2, '0')}:${String(after.getMinutes()).padStart(2, '0')}`);
    }
  };

  const timeError = openEnd
    ? ''
    : `${endDate}T${end}` <= `${startDate}T${start}`
      ? '종료 시간은 시작 시간보다 늦어야 해요.'
      : endDate !== startDate
        ? '자정을 넘기는 일정은 아직 지원하지 않아요. 같은 날 안에서 끝나게 골라 주세요.'
        : '';
  const canSubmit = Boolean(title.trim() && startDate && start && !timeError && !saving && !saved);

  // 끝 시간을 정하지 않으면 그날 다음 고정 일정이 시작할 때까지로 잡는다 (없으면 23:59)
  const openEndTime = async () => {
    const week = await api.getWeekSchedule(startDate);
    const next = (week.days.find((d) => d.date === startDate)?.items ?? [])
      .filter((item) => item.source === 'fixed' && item.start > start)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    return next?.start ?? '23:59';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const weekday = new Date(`${startDate}T00:00:00`).getDay();
      const block = {
        kind: 'event',
        title: title.trim(),
        start,
        end: openEnd ? await openEndTime() : end,
        ...(repeat === 'none' ? { date: startDate } : { dayOfWeek: repeat === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : [weekday] }),
        ...(openEnd ? { openEnd: true } : {}),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      };
      const result = await api.createFixedBlock(block);
      scheduleChanged();
      setSaved(true);
      setNotice(
        result.rescheduled
          ? `'${block.title}' 일정을 저장했어요. 겹치는 작업은 제이가 다른 시간으로 옮겼어요.`
          : `'${block.title}' 일정을 저장했어요. 작업 재배치는 하지 못했어요. (${result.rescheduleError})`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="d-form-page" onSubmit={submit}>
      <header className="d-form-bar">
        <button type="button" className="d-icon-btn" onClick={onClose} aria-label="닫기">
          <CloseIcon size={20} />
        </button>
        <h1>일정 추가</h1>
        <button type="button" className="d-pill-btn" onClick={() => nav.open('voice')}>
          <MicIcon size={16} />
          말로 하기
        </button>
      </header>

      <div className="d-field">
        <label htmlFor="event-title">제목</label>
        <input
          id="event-title"
          className="d-input d-input-lg"
          value={title}
          placeholder="예: 치과 예약"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="d-field">
        <p className="d-label">날짜 · 시간</p>
        <DateTimeRows
          rows={[
            {
              id: 'start',
              label: '시작',
              date: startDate,
              time: start,
              onDateChange: (d) => moveStart(d, start),
              onTimeChange: (t) => moveStart(startDate, t),
            },
            {
              id: 'end',
              label: '종료',
              date: endDate,
              time: openEnd ? '--:--' : end,
              onDateChange: setEndDate,
              onTimeChange: setEnd,
              disabled: openEnd,
            },
          ]}
        />
        {timeError && <p className="d-error">{timeError}</p>}
      </div>

      <div className="switch-row">
        <div>
          <p className="switch-title">끝나는 시간 정하지 않기</p>
          <p className="d-meta">노는 시간처럼 끝을 정하기 어려울 때</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={openEnd}
          aria-label="끝나는 시간 정하지 않기"
          className="d-switch"
          disabled={saving || saved}
          onClick={() => setOpenEnd((v) => !v)}
        >
          <span />
        </button>
      </div>

      <div className="d-field" role="group" aria-label="반복">
        <p className="d-label">반복</p>
        <div className="d-grid-3">
          {REPEATS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={repeat === id}
              className={`d-toggle ${repeat === id ? 'is-on' : ''}`}
              onClick={() => setRepeat(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <MemoField id="event-memo" value={memo} onChange={setMemo} placeholder="예: 신분증 챙기기, 2층 진료실" />

      <div className="j-note">
        <span className="j-mark" aria-hidden="true">
          J
        </span>
        <p>고정 일정으로 등록돼요. 이 시간엔 작업을 넣지 않고, 겹치는 작업이 있으면 제이가 다른 시간으로 옮겨 드려요.</p>
      </div>

      {notice && (
        <p className="d-alert" role="status">
          {notice}
        </p>
      )}

      <div className="d-form-foot">
        {error && (
          <p className="d-error" role="alert">
            저장하지 못했어요. {error}
          </p>
        )}
        {saved ? (
          <button type="button" className="d-btn d-btn-dark d-btn-lg" onClick={() => nav.tab('calendar')}>
            캘린더에서 보기
          </button>
        ) : (
          <button type="submit" className="d-btn d-btn-dark d-btn-lg" disabled={!canSubmit}>
            {saving ? '저장하고 다시 배치하는 중…' : '일정 추가'}
          </button>
        )}
      </div>
    </form>
  );
}
