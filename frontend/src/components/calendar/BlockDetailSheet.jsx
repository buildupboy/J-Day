import { toMinutes, formatDuration } from '../../utils/time.js';
import { getTaskById } from '../../data/sampleSchedule.js';

const KIND_LABEL = {
  fixed: '고정 시간',
  routine: '루틴',
  task: '작업',
  event: '일정',
  break: '휴식',
};
const PRIORITY_LABEL = { must: '필수', important: '중요', optional: '선택' };

function deadlineText(iso) {
  const d = new Date(`${iso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  const label = d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const dday = diff === 0 ? 'D-DAY' : diff > 0 ? `D-${diff}` : `D+${-diff}`;
  return `${label} · ${dday}`;
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// 타임테이블 블록을 누르면 올라오는 상세 시트.
// task 블록은 상위 작업의 마감일·예상 시간, 하위 작업 체크리스트, 메모·첨부, 완료/미루기를 보여준다.
// details: hooks/useBlockDetails.js 의 반환값
export default function BlockDetailSheet({ block, details, onClose }) {
  const task = block.taskId ? getTaskById(block.taskId) : null;
  const slotMinutes = toMinutes(block.end) - toMinutes(block.start);
  const status = details.statusOf(block.id);

  const isDone = (st) => st.done !== details.toggled.has(st.id);
  const doneSubtasks = task ? task.subtasks.filter(isDone) : [];
  const doneMinutes = doneSubtasks.reduce((sum, st) => sum + st.estimatedMinutes, 0);

  // 블록을 완료 처리하면 이 블록의 하위 작업도 함께 완료로 맞춘다 (완료 취소 시에는 체크를 건드리지 않는다)
  const markDone = () => {
    const sub = task?.subtasks.find((st) => st.id === block.subtaskId);
    if (sub && status !== 'done' && !isDone(sub)) details.toggleSubtask(sub.id);
    details.setStatus(block.id, 'done');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet sheet-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <span className={`kind-chip tt-${block.kind}`}>{KIND_LABEL[block.kind]}</span>
            <h2>{block.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <dl className="detail-list">
          <div>
            <dt>시간</dt>
            <dd>
              {block.start}–{block.end} · {formatDuration(slotMinutes)}
            </dd>
          </div>
          {block.location && (
            <div>
              <dt>장소</dt>
              <dd>{block.location}</dd>
            </div>
          )}
          {task && (
            <>
              <div>
                <dt>상위 작업</dt>
                <dd>{task.title}</dd>
              </div>
              <div>
                <dt>마감일</dt>
                <dd>{deadlineText(task.deadline)}</dd>
              </div>
              <div>
                <dt>예상 소요 시간</dt>
                <dd>
                  총 {formatDuration(task.estimatedMinutes)} · 완료 {formatDuration(doneMinutes)}
                </dd>
              </div>
              <div>
                <dt>중요도</dt>
                <dd>{PRIORITY_LABEL[task.priority]}</dd>
              </div>
            </>
          )}
        </dl>

        {task && (
          <>
            <div className="subtask-box">
              <div className="subtask-head">
                <h3>하위 작업</h3>
                <span>
                  {doneSubtasks.length} / {task.subtasks.length} 완료
                </span>
              </div>
              <div className="progress">
                <i style={{ width: `${(doneSubtasks.length / task.subtasks.length) * 100}%` }} />
              </div>
              <ul className="subtask-list">
                {task.subtasks.map((st) => (
                  <li key={st.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={isDone(st)}
                        onChange={() => details.toggleSubtask(st.id)}
                      />
                      <span className={isDone(st) ? 'is-done' : ''}>{st.title}</span>
                      <em>{formatDuration(st.estimatedMinutes)}</em>
                    </label>
                    {st.id === block.subtaskId && <small>이 시간에 할 일</small>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="detail-section">
              <h3>작업 메모</h3>
              <textarea
                className="memo-input"
                rows={3}
                placeholder="이 작업에 대한 메모를 남겨 보세요"
                value={details.memoOf(task.id)}
                onChange={(e) => details.setMemo(task.id, e.target.value)}
              />
            </div>

            <div className="detail-section">
              <h3>첨부</h3>
              <ul className="file-list">
                {details.filesOf(task.id).map((f) => (
                  <li key={f.id}>
                    <span>📎 {f.name}</span>
                    <em>{formatSize(f.size)}</em>
                    <button type="button" onClick={() => details.removeFile(task.id, f.id)} aria-label="첨부 삭제">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <label className="file-add">
                + 과제 PDF · txt 추가
                <input
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  multiple
                  hidden
                  onChange={(e) => {
                    details.addFiles(task.id, e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="detail-actions">
              <button
                type="button"
                className={`action-button ${status === 'postponed' ? 'is-on' : ''}`}
                onClick={() => details.setStatus(block.id, 'postponed')}
              >
                {status === 'postponed' ? '미루기 취소' : '미루기'}
              </button>
              <button
                type="button"
                className={`action-button action-primary ${status === 'done' ? 'is-on' : ''}`}
                onClick={markDone}
              >
                {status === 'done' ? '완료 취소' : '완료'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
