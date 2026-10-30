import { useState } from 'react';
import { api } from '../api/client.js';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';
import { CloseIcon, MicIcon } from '../components/common/Icons.jsx';
import DateWheel from '../components/tasks/DateWheel.jsx';
import WheelPicker from '../components/tasks/WheelPicker.jsx';
import EstimateAssist from '../components/tasks/EstimateAssist.jsx';
import { parseTaskText, toIsoDate } from '../utils/parseTaskText.js';
import { inferTaskType } from '../utils/taskType.js';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';

const PRIORITIES = [
  { id: 'must', name: 'Must', rank: '1순위', hint: 'Must · 가장 먼저 배치돼요' },
  { id: 'important', name: 'Should', rank: '2순위', hint: 'Should · Must 작업과 겹치면 뒤로 조정될 수 있어요' },
  { id: 'optional', name: 'Could', rank: '3순위', hint: 'Could · 여유 시간에 배치돼요' },
];

const TIMES = [...Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`), '23:59']
  .sort()
  .map((t) => ({ value: t, label: t }));

// 03-2 작업 추가: 제목·마감일·예상 시간·중요도를 입력하거나 말로 채운다.
export default function TasksPage({ onClose }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [time, setTime] = useState('23:59');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [subtasks, setSubtasks] = useState([]);
  const [estimatedType, setEstimatedType] = useState(null);
  const [priority, setPriority] = useState('important');
  const [filled, setFilled] = useState(false); // 말한 내용으로 자동 채웠는지
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const { supported, listening, interimTranscript, error, start, stop } = useSpeechRecognition({
    onFinalResult: (text) => {
      const parsed = parseTaskText(text);
      if (!parsed.title && !parsed.deadline) return;
      if (parsed.title) { setTitle(parsed.title); setSubtasks([]); setEstimatedType(null); }
      if (parsed.deadline) setDate(parsed.deadline);
      setFilled(true);
    },
  });

  const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const canSubmit = Boolean(title.trim() && date && totalMinutes > 0);
  const priorityInfo = PRIORITIES.find((p) => p.id === priority);

  const applyEstimate = (est) => {
    setHours(String(Math.floor(est.baseEstimatedMinutes / 60)));
    setMinutes(String(est.baseEstimatedMinutes % 60));
    setEstimatedType(est.type);
    setSubtasks(est.subtasks);
  };

  const submit = async () => {
    if (saving || !canSubmit) return;
    setSaving(true);
    setSaveError('');
    const task = {
      title: title.trim(),
      type: estimatedType ?? inferTaskType(title),
      deadline: `${date}T${time}:00+09:00`,
      importance: { must: 3, important: 2, optional: 1 }[priority],
      baseEstimatedMinutes: totalMinutes,
      subtasks,
    };
    try {
      const result = await api.createTask(task);
      scheduleChanged();
      setToast(result.unplaced?.length ? `'${task.title}' 저장됨 · 배치하지 못한 시간이 있어요` : `'${task.title}' 저장·배치 완료`);
      setTimeout(() => setToast(''), 2200);
      setTitle('');
      setHours('');
      setMinutes('');
      setSubtasks([]);
      setEstimatedType(null);
      setFilled(false);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="d-form-page">
      <header className="d-form-bar">
        <button type="button" className="d-icon-btn" onClick={onClose} aria-label="닫기">
          <CloseIcon size={20} />
        </button>
        <h1>작업 추가</h1>
        <button
          type="button"
          className={`d-pill-btn ${listening ? 'is-listening' : ''}`}
          onClick={listening ? stop : start}
          disabled={!supported}
        >
          <MicIcon size={16} />
          {listening ? '듣는 중' : '말로 하기'}
        </button>
      </header>

      {listening && (
        <p className="d-alert" role="status">
          {interimTranscript || '예: "12월 3일까지 캡스톤 보고서 끝내야 해"'}
        </p>
      )}
      {error && !listening && <p className="d-error">음성 인식에 실패했어요. 직접 입력해 주세요.</p>}
      {filled && <p className="d-alert">말한 내용으로 채웠어요. 눌러서 고칠 수 있어요.</p>}

      <div className="d-field">
        <label htmlFor="task-title">제목</label>
        <input
          id="task-title"
          className="d-input d-input-lg"
          value={title}
          placeholder="예: 선형대수학 과제 5"
          onChange={(e) => { setTitle(e.target.value); setSubtasks([]); setEstimatedType(null); }}
        />
      </div>

      <div className="d-field">
        <p className="d-label">마감일</p>
        <div className="d-wheel-box is-split">
          <DateWheel value={date} onChange={setDate} label="마감 날짜" />
          <WheelPicker items={TIMES} value={time} onChange={setTime} label="마감 시각" />
        </div>
      </div>

      <div className="d-field">
        <p className="d-label">예상 소요 시간</p>
        <div className="d-grid-2">
          <label className="unit-box">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="0"
              value={hours}
              onChange={(e) => { setHours(e.target.value); setSubtasks([]); }}
              aria-label="예상 시간(시간)"
            />
            <span>시간</span>
          </label>
          <label className="unit-box">
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="59"
              step="5"
              placeholder="0"
              value={minutes}
              onChange={(e) => { setMinutes(e.target.value); setSubtasks([]); }}
              aria-label="예상 시간(분)"
            />
            <span>분</span>
          </label>
        </div>
        <EstimateAssist title={title} onApply={applyEstimate} />
      </div>

      <div className="d-field" role="group" aria-label="중요도">
        <p className="d-label">중요도</p>
        <div className="d-grid-3">
          {PRIORITIES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={priority === p.id}
              className={`priority-btn ${priority === p.id ? 'is-on' : ''}`}
              onClick={() => setPriority(p.id)}
            >
              <strong>{p.name}</strong>
              <small>{p.rank}</small>
            </button>
          ))}
        </div>
        <p className="d-meta">{priorityInfo.hint}</p>
      </div>

      <div className="d-form-foot">
        {saveError && (
          <p className="d-error" role="alert">
            저장하지 못했어요. {saveError}
          </p>
        )}
        <button type="button" className="d-btn d-btn-dark d-btn-lg" disabled={!canSubmit || saving} onClick={submit}>
          {saving ? '저장·배치 중…' : '추가하고 배치하기'}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
