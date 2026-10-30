import { useState } from 'react';
import { api } from '../api/client.js';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';
import { MicIcon } from '../components/common/Icons.jsx';
import DeadlineInput from '../components/tasks/DeadlineInput.jsx';
import EstimateAssist from '../components/tasks/EstimateAssist.jsx';
import { parseTaskText } from '../utils/parseTaskText.js';
import { estimateTask } from '../utils/estimateTask.js';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';

const PRIORITIES = [
  { id: 'must', name: 'Must', rank: '1순위', hint: 'Must · 가장 먼저 배치돼요' },
  { id: 'important', name: 'Should', rank: '2순위', hint: 'Should · Must 작업과 겹치면 뒤로 조정될 수 있어요' },
  { id: 'optional', name: 'Could', rank: '3순위', hint: 'Could · 여유 시간에 배치돼요' },
];

// 일정 탭: 작업 추가. 제목·마감일·예상 시간·중요도를 입력하거나 말로 채운다.
export default function TasksPage({ onClose }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(''); // 'YYYY-MM-DD', 입력이 올바르지 않으면 ''
  const [time, setTime] = useState('23:59');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [subtasks, setSubtasks] = useState([]);
  const [priority, setPriority] = useState('must');
  const [filled, setFilled] = useState(false); // 말한 내용으로 자동 채웠는지
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [formKey, setFormKey] = useState(0); // 등록 후 마감일 입력칸을 비우기 위한 키

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
  const canSubmit = Boolean(title.trim() && date && totalMinutes > 0);
  const priorityInfo = PRIORITIES.find((p) => p.id === priority);

  const applyEstimate = (est) => {
    setHours(String(est.totalHours));
    setMinutes('0');
    setSubtasks(est.subtasks);
  };

  const submit = async () => {
    if (saving || !canSubmit) return;
    setSaving(true);
    setSaveError('');
    const task = {
      title: title.trim(),
      type: estimateTask(title).type,
      deadline: `${date}T${time}:00+09:00`,
      importance: ({ must: 3, important: 2, optional: 1 })[priority],
      baseEstimatedMinutes: totalMinutes,
      subtasks,
    };
    try {
    const result = await api.createTask(task);
    scheduleChanged();
    setToast(result.unplaced?.length ? `'${task.title}' 저장됨 · 배치하지 못한 시간이 있어요` : `'${task.title}' 저장·배치 완료`);
    setTimeout(() => setToast(''), 2200);
    setTitle('');
    setDate('');
    setFormKey((k) => k + 1);
    setTime('23:59');
    setHours('');
    setMinutes('');
    setSubtasks([]);
    setFilled(false);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
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
          aria-label={listening ? '듣기 중지' : '말로 하기'}
        >
          <MicIcon size={20} />
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
      <DeadlineInput key={formKey} date={date} time={time} onDateChange={setDate} onTimeChange={setTime} />

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
        {saveError && <p className="field-error" role="alert">저장하지 못했어요. {saveError}</p>}
        <button type="button" className="primary-button" disabled={!canSubmit || saving} onClick={submit}>
          {saving ? '저장·배치 중…' : '빈 시간에 자동 배치'}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
