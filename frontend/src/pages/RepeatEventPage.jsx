import { useState } from 'react';
import DateTimeRows from '../components/common/DateTimeRows.jsx';
import MemoField from '../components/common/MemoField.jsx';
import { CloseIcon, MicIcon } from '../components/common/Icons.jsx';
import { api } from '../api/client.js';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';
import { WEEKDAY_LABELS } from '../utils/calendar.js';
import { josa } from '../utils/labels.js';

const KINDS = [
  ['fixed', '고정 일정', '예: 동아리 정기 회의'],
  ['routine', '루틴', '예: 기상 후 독서'],
];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 화면은 월요일부터, dayOfWeek는 0=일
const PRESETS = [
  ['평일', [1, 2, 3, 4, 5]],
  ['주말', [0, 6]],
  ['매일', [0, 1, 2, 3, 4, 5, 6]],
];

const sameDays = (a, b) => a.length === b.length && a.every((d) => b.includes(d));

// 02-3 반복 일정 등록: 고정 일정·루틴처럼 요일마다 반복하는 일정을 넣는다 (POST /api/fixed-blocks).
export default function RepeatEventPage({ nav, onClose, editingBlock = null }) {
  const editing = Boolean(editingBlock);
  const dated = Boolean(editingBlock?.date);
  const [date, setDate] = useState(editingBlock?.date ?? '');
  const [kind, setKind] = useState(editingBlock?.kind === 'routine' ? 'routine' : 'fixed');
  const [title, setTitle] = useState(editingBlock?.title ?? '');
  const [days, setDays] = useState(() => editingBlock?.dayOfWeek ?? [new Date().getDay()]);
  const [start, setStart] = useState(editingBlock?.start ?? '09:00');
  const [end, setEnd] = useState(editingBlock?.end ?? '10:30');
  const [memo, setMemo] = useState(editingBlock?.memo ?? editingBlock?.location ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const toggleDay = (d) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  // 시작을 종료보다 늦게 옮기면 종료를 1시간 뒤로 맞춘다 (자정을 넘기면 23:59)
  const moveStart = (next) => {
    setStart(next);
    if (end <= next) {
      const [h, m] = next.split(':').map(Number);
      setEnd(h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  };

  const timeError = end <= start ? '종료 시간은 시작 시간보다 늦어야 해요.' : '';
  const canSubmit = Boolean(title.trim() && days.length && !timeError && !saving && !saved);
  const kindLabel = KINDS.find(([id]) => id === kind)[1];

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const block = {
        kind,
        title: title.trim(),
        dayOfWeek: [...days].sort(),
        start,
        end,
        ...(memo.trim() ? { memo: memo.trim() } : {}),
      };
      if (editing) {
        await api.updateFixedBlock(editingBlock.id, { title: block.title, ...(dated ? { date } : { dayOfWeek: block.dayOfWeek }), start, end, memo: memo.trim(),
          ...(editingBlock.location !== undefined ? { location: '' } : {}) });
        scheduleChanged();
        onClose();
        return;
      }
      const result = await api.createFixedBlock(block);
      scheduleChanged();
      setSaved(true);
      setNotice(
        result.rescheduled
          ? `'${block.title}' ${josa(kindLabel, '을', '를')} 매주 반복하도록 저장했어요. 겹치는 작업은 제이가 옮겼어요.`
          : `'${block.title}' ${josa(kindLabel, '을', '를')} 저장했어요. 작업 재배치는 하지 못했어요. (${result.rescheduleError})`
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
        <h1>{editing ? `${kindLabel} 수정` : '반복 일정 추가'}</h1>
        {nav ? <button type="button" className="d-pill-btn" onClick={() => nav.open('voice')}>
          <MicIcon size={16} />
          말로 하기
        </button> : <span style={{ width: 44 }} aria-hidden="true" />}
      </header>

      <div className="d-field" role="group" aria-label="종류">
        <p className="d-label">종류</p>
        <div className="d-grid-2">
          {KINDS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={kind === id}
              disabled={editing}
              className={`d-toggle ${kind === id ? 'is-on' : ''}`}
              onClick={() => setKind(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="d-field">
        <label htmlFor="repeat-title">제목</label>
        <input
          id="repeat-title"
          className="d-input d-input-lg"
          value={title}
          placeholder={KINDS.find(([id]) => id === kind)[2]}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {!dated && <div className="d-field" role="group" aria-label="반복 요일">
        <div className="d-section-head">
          <p className="d-label">반복 요일</p>
          <div className="preset-row">
            {PRESETS.map(([label, preset]) => (
              <button
                key={label}
                type="button"
                className={`preset-chip ${sameDays(days, preset) ? 'is-on' : ''}`}
                aria-pressed={sameDays(days, preset)}
                onClick={() => setDays(preset)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="day-picker repeat-days">
          {DAY_ORDER.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={days.includes(d)}
              className={days.includes(d) ? 'is-on' : ''}
              onClick={() => toggleDay(d)}
            >
              {WEEKDAY_LABELS[i]}
            </button>
          ))}
        </div>
        {!days.length && <p className="d-error">반복할 요일을 하나 이상 골라 주세요.</p>}
      </div>}

      <div className="d-field">
        <p className="d-label">시간</p>
        <DateTimeRows
          rows={[
            { id: 'start', label: '시작', ...(dated ? { date, onDateChange: setDate } : {}), time: start, onTimeChange: moveStart, disabled: saving },
            { id: 'end', label: '종료', time: end, onTimeChange: setEnd, disabled: saving },
          ]}
        />
        {timeError && <p className="d-error">{timeError}</p>}
      </div>

      <MemoField id="repeat-memo" value={memo} onChange={setMemo} placeholder="예: 3주차부터 실습실로 이동" />

      <div className="j-note">
        <span className="j-mark" aria-hidden="true">
          J
        </span>
        <p>{editing ? dated ? '지정한 날짜의 일정에만 적용돼요.' : '변경한 내용은 이 일정의 모든 반복에 적용돼요.' : '고른 요일마다 같은 시간에 반복돼요. 이 시간엔 작업을 넣지 않고, 겹치는 작업은 제이가 다른 시간으로 옮겨 드려요.'}</p>
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
          <button type="button" className="d-btn d-btn-dark d-btn-lg" onClick={() => nav.tab('tasks', 'setup')}>
            시간표·루틴에서 보기
          </button>
        ) : (
          <button type="submit" className="d-btn d-btn-dark d-btn-lg" disabled={!canSubmit}>
            {saving ? editing ? '저장 중…' : '저장하고 다시 배치하는 중…' : editing ? '수정 내용 저장' : '반복 일정 추가'}
          </button>
        )}
      </div>
    </form>
  );
}
