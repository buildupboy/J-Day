import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';
import { MicIcon } from '../components/common/Icons.jsx';
import WheelPicker from '../components/tasks/WheelPicker.jsx';
import EstimateAssist from '../components/tasks/EstimateAssist.jsx';
import { parseTaskText, toIsoDate } from '../utils/parseTaskText.js';

const PRIORITIES = [
  { id: 'must', name: 'Must', rank: '1순위', hint: 'Must · 가장 먼저 배치돼요' },
  { id: 'important', name: 'Should', rank: '2순위', hint: 'Should · Must 작업과 겹치면 뒤로 조정될 수 있어요' },
  { id: 'optional', name: 'Could', rank: '3순위', hint: 'Could · 여유 시간에 배치돼요' },
];

const TIME_ITEMS = ['12:00', '18:00', '23:59'].map((t) => ({ value: t, label: t }));
const DATE_RANGE_DAYS = 180;

function dateLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

// 마감일 휠에 보여 줄 날짜 목록: 오늘부터 180일. 범위 밖 값이 들어오면 그 값도 포함한다.
function buildDateItems(selected) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const isos = Array.from({ length: DATE_RANGE_DAYS }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return toIsoDate(d);
  });
  if (selected && !isos.includes(selected)) isos.push(selected);
  isos.sort();
  return isos.map((iso) => ({ value: iso, label: dateLabel(iso) }));
}

function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toIsoDate(d);
}

// 일정 탭: 작업 추가. 제목·마감일·예상 시간·중요도를 입력하거나 말로 채운다.
export default function TasksPage({ onClose }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDeadline);
  const [time, setTime] = useState('23:59');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [subtasks, setSubtasks] = useState([]);
  const [priority, setPriority] = useState('must');
  const [filled, setFilled] = useState(false); // 말한 내용으로 자동 채웠는지
  const [toast, setToast] = useState('');

  const dateItems = useMemo(() => buildDateItems(date), [date]);

  const { supported, listening, interimTranscript, error, start, stop } = useSpeechRecognition({
    onFinalResult: (text) => {
      const parsed = parseTaskText(text);
      if (!parsed.title && !parsed.deadline) return;
      if (parsed.title) setTitle(parsed.title);
      if (parsed.deadline) setDate(parsed.deadline);
      setFilled(true);
    },
  });

  const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const canSubmit = Boolean(title.trim() && totalMinutes > 0);
  const priorityInfo = PRIORITIES.find((p) => p.id === priority);

  const applyEstimate = (est) => {
    setHours(String(est.totalHours));
    setMinutes('0');
    setSubtasks(est.subtasks);
  };

  const submit = async () => {
    const task = {
      title: title.trim(),
      deadline: date,
      deadlineTime: time,
      priority,
      estimatedMinutes: totalMinutes,
      subtasks,
    };
    // TODO: 백엔드 POST /api/tasks → POST /api/schedule/reschedule 로 빈 시간에 자동 배치
    await api.createTask(task).catch(() => null);
    setToast(`'${task.title}' 작업을 등록했어요`);
    setTimeout(() => setToast(''), 2200);
    setTitle('');
    setDate(defaultDeadline());
    setTime('23:59');
    setHours('');
    setMinutes('');
    setSubtasks([]);
    setFilled(false);
  };

  return (
    <div className="new-task">
      <header className="new-task-bar">
        <button type="button" className="bar-button bar-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <h1>작업 추가</h1>
        <button
          type="button"
          className={`bar-button bar-speak ${listening ? 'is-listening' : ''}`}
          onClick={listening ? stop : start}
          disabled={!supported}
        >
          <MicIcon size={18} />
          {listening ? '듣는 중' : '말로 하기'}
        </button>
      </header>

      {listening && (
        <p className="listen-banner">
          <i /> {interimTranscript || '예: "12월 3일까지 캡스톤 보고서 끝내야 해"'}
        </p>
      )}
      {error && !listening && <p className="field-error">음성 인식에 실패했어요. 직접 입력해 주세요.</p>}
      {filled && (
        <p className="ai-note">
          <b>AI</b> 말한 내용으로 채웠어요. 눌러서 고칠 수 있어요.
        </p>
      )}

      <label className="section-label" htmlFor="task-title">
        제목
      </label>
      <input
        id="task-title"
        className="text-field"
        value={title}
        placeholder="예: 선형대수학 과제 5"
        onChange={(e) => setTitle(e.target.value)}
      />

      <span className="section-label">마감일</span>
      <div className="wheel-row">
        <WheelPicker items={dateItems} value={date} onChange={setDate} label="마감 날짜" />
        <WheelPicker items={TIME_ITEMS} value={time} onChange={setTime} label="마감 시각" />
      </div>

      <span className="section-label">예상 소요 시간</span>
      <div className="duration-row">
        <label className="duration-field">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-label="예상 시간(시간)"
          />
          <span className="unit">시간</span>
        </label>
        <label className="duration-field">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="59"
            placeholder="0"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            aria-label="예상 시간(분)"
          />
          <span className="unit">분</span>
        </label>
      </div>

      <EstimateAssist title={title} onApply={applyEstimate} />

      <span className="section-label">중요도</span>
      <div className="priority-cards">
        {PRIORITIES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={priority === p.id ? 'is-on' : ''}
            onClick={() => setPriority(p.id)}
          >
            <strong>{p.name}</strong>
            <small>{p.rank}</small>
          </button>
        ))}
      </div>
      <p className="priority-hint">{priorityInfo.hint}</p>

      <div className="task-footer">
        <button type="button" className="primary-button" disabled={!canSubmit} onClick={submit}>
          빈 시간에 자동 배치
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
