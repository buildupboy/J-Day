import { formatDuration } from '../../utils/time.js';
import { priorityOf, daysUntil, dDay } from '../../utils/labels.js';

function deadlineLabel(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return `${d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} · ${dDay(daysUntil(iso))}`;
}

// 제이가 말로 등록한 작업 카드. 서버에 이미 저장된 내용을 보여 주고 캘린더로 이어 준다.
export default function TaskProposalCard({ task, status, onOpenCalendar, onOpenList }) {
  const priority = priorityOf(task);
  const placed = status !== 'pending_schedule';
  return (
    <article className="d-card proposal" aria-label="등록 확인">
      <p className="d-meta">{placed ? '이렇게 등록하고 배치했어요' : '저장했어요 · 배치를 기다리는 중이에요'}</p>
      <div className="proposal-head">
        <h2>{task.title}</h2>
        <span className={`d-chip is-${priority.tone}`}>{priority.label}</span>
      </div>
      <dl className="proposal-info">
        <dt>마감</dt>
        <dd>{deadlineLabel(task.deadline)}</dd>
        <dt>예상 시간</dt>
        <dd>
          <strong>{formatDuration(task.estimatedMinutes ?? 0)}</strong>
        </dd>
        {task.subtasks?.length > 0 && (
          <>
            <dt>작업 분할</dt>
            <dd>{task.subtasks.length}개로 나눴어요</dd>
          </>
        )}
      </dl>
      {task.subtasks?.length > 0 && (
        <p className="proposal-split">
          {task.subtasks.map((st) => `${st.title} ${formatDuration(st.estimatedMinutes)}`).join(' · ')}
        </p>
      )}
      <p className="d-meta">시간을 말하지 않으면 제이가 과제 내용을 보고 예상 시간을 정해요.</p>
      <div className="d-grid-2">
        <button type="button" className="d-btn d-btn-line" onClick={onOpenList}>
          일정 목록
        </button>
        <button type="button" className="d-btn d-btn-dark" onClick={onOpenCalendar}>
          캘린더에서 보기
        </button>
      </div>
    </article>
  );
}
