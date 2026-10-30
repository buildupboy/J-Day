import { useState } from 'react';
import DateWheel from '../components/tasks/DateWheel.jsx';
import { CloseIcon, MicIcon } from '../components/common/Icons.jsx';
import { toIsoDate } from '../utils/parseTaskText.js';

const REPEATS = [
  ['none', '안 함'],
  ['weekly', '매주'],
  ['daily', '매일'],
];

// 02-2 일정 등록: 시간이 정해진 약속·예약·시험을 고정 일정으로 넣는다.
// TODO: 고정 일정 등록 API가 생기면 저장한다. 지금 백엔드에는 수업 시간표 저장(PUT /api/timetable)만 있다.
export default function NewEventPage({ nav, onClose }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [start, setStart] = useState('14:00');
  const [end, setEnd] = useState('15:00');
  const [openEnd, setOpenEnd] = useState(false);
  const [repeat, setRepeat] = useState('none');
  const [notice, setNotice] = useState('');

  const timeError = !openEnd && start >= end ? '종료 시간은 시작 시간보다 늦어야 해요.' : '';
  const canSubmit = Boolean(title.trim() && date && start && !timeError);

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setNotice('일정 저장은 아직 서버에 연결되지 않았어요. 말로 추가하면 제이가 작업으로 등록할 수 있어요.');
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
        <p className="d-label">날짜</p>
        <div className="d-wheel-box">
          <DateWheel value={date} onChange={setDate} />
        </div>
      </div>

      <div className="d-field">
        <p className="d-label">시간</p>
        <div className="time-pair">
          <label className="time-box">
            <span>시작</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <span aria-hidden="true" className="time-dash">
            –
          </span>
          <label className={`time-box ${openEnd ? 'is-off' : ''}`}>
            <span>종료</span>
            <input type="time" value={end} disabled={openEnd} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
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
        <button type="submit" className="d-btn d-btn-dark d-btn-lg" disabled={!canSubmit}>
          일정 추가
        </button>
      </div>
    </form>
  );
}
