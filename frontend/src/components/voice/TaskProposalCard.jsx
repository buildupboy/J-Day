import { useState } from 'react';
import { CalendarIcon, ClockIcon, NoteIcon } from '../common/Icons.jsx';
import { formatDuration } from '../../utils/time.js';

function deadlineLabel(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const time = iso.includes('T') ? ` ${new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })}` : '';
  return `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}${time}까지`;
}

// 제이가 제안한 작업 카드. 수정(제목·마감일) 후 "일정에 추가"를 누르면 확정된다.
export default function TaskProposalCard({ task, added, status, cardMode, updated = false, onChange, onAdd }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(task.deadline);

  const save = () => {
    onChange({ ...task, title: title.trim() || task.title, deadline: deadline || task.deadline });
    setEditing(false);
  };

  return (
    <div className="proposal">
      {editing ? (
        <div className="proposal-edit">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="작업 이름" />
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="마감일" />
        </div>
      ) : (
        <>
          <h3>{task.title}</h3>
          <ul className="proposal-info">
            <li>
              <CalendarIcon size={18} />
              {deadlineLabel(task.deadline)}
            </li>
            <li>
              <ClockIcon size={18} />
              예상 {formatDuration(task.estimatedMinutes)}
            </li>
            <li>
              <NoteIcon size={18} />
              작업 분할 ({task.subtasks.length}개)
            </li>
          </ul>
          <ul className="proposal-subtasks">
            {task.subtasks.map((st) => (
              <li key={st.title}>
                {st.title} ({formatDuration(st.estimatedMinutes)})
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="proposal-actions">
        {editing ? (
          <button type="button" className="proposal-primary" onClick={save}>
            저장
          </button>
        ) : cardMode === 'existing' ? (
          <button type="button" className="proposal-primary is-added" disabled>기존 저장된 과제</button>
        ) : added ? (
          <button type="button" className="proposal-primary is-added" disabled>
            {status === 'pending_schedule' ? '저장됨 · 배치 대기' : updated ? '수정·저장·배치 완료' : '저장·배치 완료'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)}>
              수정
            </button>
            <button type="button" className="proposal-primary" onClick={onAdd}>
              일정에 추가
            </button>
          </>
        )}
      </div>
    </div>
  );
}
