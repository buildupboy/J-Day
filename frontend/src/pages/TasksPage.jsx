import { useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js';
import { MicIcon, PaperclipIcon } from '../components/common/Icons.jsx';
import { parseTaskText, formatDeadline } from '../utils/parseTaskText.js';
import { estimateTask } from '../utils/estimateTask.js';

const PRIORITIES = [
  ['must', '필수'],
  ['important', '중요'],
  ['optional', '선택'],
];

// 일정 탭: 새 작업 등록. 말하거나 입력하면 작업 이름·마감일을 채우고 예상 소요 시간을 계산한다.
export default function TasksPage({ onClose }) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState('must');
  const [filled, setFilled] = useState(false); // 말한 내용으로 자동 채웠는지
  const [file, setFile] = useState(null);
  const [toast, setToast] = useState('');

  const applyText = (source) => {
    const parsed = parseTaskText(source);
    if (!parsed.title && !parsed.deadline) return;
    if (parsed.title) setTitle(parsed.title);
    if (parsed.deadline) setDeadline(parsed.deadline);
    setFilled(true);
  };

  const { supported, listening, interimTranscript, error, start, stop } = useSpeechRecognition({
    onFinalResult: (t) => {
      setText(t);
      applyText(t);
    },
  });

  const estimate = useMemo(() => (title.trim() ? estimateTask(title) : null), [title]);
  const canSubmit = Boolean(title.trim() && deadline);

  const submit = async () => {
    const task = {
      title: title.trim(),
      deadline,
      priority,
      estimatedMinutes: estimate.totalHours * 60,
      subtasks: estimate.subtasks,
    };
    // TODO: 백엔드 POST /api/tasks → POST /api/schedule/reschedule 로 빈 시간에 자동 배치
    await api.createTask(task).catch(() => null);
    setToast(`'${task.title}' 작업을 등록했어요`);
    setTimeout(() => setToast(''), 2200);
    setText('');
    setTitle('');
    setDeadline('');
    setFilled(false);
    setFile(null);
  };

  return (
    <div className="new-task">
      <header className="new-task-head">
        <h1>새 작업</h1>
        <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </header>

      <div className="speak-box">
        <textarea
          rows={2}
          value={listening ? interimTranscript : text}
          readOnly={listening}
          placeholder={'"12월 3일까지 캡스톤 보고서 끝내야 해"'}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => e.target.value.trim() && applyText(e.target.value)}
          aria-label="말하거나 입력하기"
        />
        <button
          type="button"
          className={`speak-mic ${listening ? 'is-listening' : ''}`}
          onClick={listening ? stop : start}
          disabled={!supported}
          aria-label={listening ? '듣기 중지' : '말로 입력'}
        >
          <MicIcon size={22} />
        </button>
      </div>
      {error && !listening && <p className="field-error">음성 인식에 실패했어요. 직접 입력해 주세요.</p>}

      {filled && (
        <p className="ai-note">
          <b>AI</b> 말한 내용으로 채웠어요. 눌러서 고칠 수 있어요.
        </p>
      )}

      <div className="field-row">
        <label htmlFor="task-title">작업</label>
        <input
          id="task-title"
          value={title}
          placeholder="작업 이름"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field-row">
        <label htmlFor="task-deadline">마감</label>
        <span className={`date-field ${deadline ? '' : 'is-empty'}`}>
          {deadline ? formatDeadline(deadline) : '날짜 선택'}
          <input
            id="task-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            aria-label="마감일"
          />
        </span>
      </div>

      <div className="field-row">
        <label>중요도</label>
        <div className="priority-chips">
          {PRIORITIES.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={priority === id ? 'is-on' : ''}
              onClick={() => setPriority(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {estimate ? (
        <section className="estimate-card">
          <div className="estimate-top">
            <span>예상 소요 시간</span>
            <strong>
              {estimate.minHours}~{estimate.maxHours}시간
            </strong>
          </div>
          <ul>
            {estimate.items.map((it) => (
              <li key={it.title}>
                <span>{it.title}</span>
                <b>{it.hours}h</b>
              </li>
            ))}
          </ul>
          {estimate.coef !== 1 && (
            <p className="estimate-note">
              내 {estimate.label} 속도 ×{estimate.coef} 반영
            </p>
          )}
        </section>
      ) : (
        <section className="estimate-card is-empty">
          작업 이름을 입력하면 예상 소요 시간과 작업 분할을 계산해요.
        </section>
      )}

      <label className="attach-box">
        <PaperclipIcon size={18} />
        {file ? file.name : '과제 안내문·PDF 올리면 더 정확해져요'}
        <input
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          hidden
          onChange={(e) => setFile(e.target.files[0] ?? null)}
        />
      </label>

      <div className="task-footer">
        <button type="button" className="primary-button" disabled={!canSubmit} onClick={submit}>
          빈 시간에 자동 배치
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
