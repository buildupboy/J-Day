import { useState } from 'react';
import { api } from '../../api/client.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';
import { toMinutes, formatDuration } from '../../utils/time.js';
import { getTaskById } from '../../data/sampleSchedule.js';
import { useAppDialogs } from '../common/AppDialogs.jsx';
import { FixedMemo, TaskMemo, PostponeForm, ReminderField, SubtaskRow, SubtaskAddForm } from './TaskEditParts.jsx';
import SheetHandle from '../common/SheetHandle.jsx';
import CalendarEditDialog from './CalendarEditDialog.jsx';

const KIND_LABEL = {
  fixed: '고정 시간',
  routine: '루틴',
  task: '작업',
  event: '일정',
  break: '휴식',
};
const PRIORITY_LABEL = { must: 'Must', important: 'Should', optional: 'Could' };

function deadlineText(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
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
  const { confirm } = useAppDialogs();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [editing, setEditing] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [postponing, setPostponing] = useState(false);
  const task = block.task ?? (block.taskId ? getTaskById(block.taskId) : null);
  const isFixed = block.source === 'fixed'; // 수업·알바·루틴 (반복 일정)
  // 작업 블록의 삭제는 상위 작업 전체를, 그 외(고정 시간·루틴)는 그 날짜의 일정만 지운다
  const remove = async () => {
    const message = task
      ? `‘${task.title}’ 작업을 삭제할까요? 하위 작업과 캘린더에 배치된 블록이 모두 사라져요.`
      : `‘${block.title}’ 일정을 캘린더에서 삭제할까요?`;
    if (!(await confirm(message))) return;
    setDeleting(true);
    setDeleteError('');
    try {
      if (task) await api.deleteTask(task.id);
      else await api.deleteCalendarItem(block.source, block.id, block.date);
      scheduleChanged();
      onClose();
    } catch (error) {
      setDeleteError(`삭제하지 못했어요. ${error.message}`);
      setDeleting(false);
    }
  };
  const slotMinutes = block.start && block.end ? toMinutes(block.end) - toMinutes(block.start) : 0;
  const status = details.statusOf(block.id);

  const isDone = (st) => st.done !== details.toggled.has(st.id);
  const subtasks = task?.subtasks ?? [];
  const doneSubtasks = subtasks.filter(isDone);
  // 총 시간은 하위 작업 합계에 유형별 개인 보정(지난 수행 기록 기준)을 적용한 값이다
  const subtaskSum = subtasks.reduce((sum, st) => sum + st.estimatedMinutes, 0);
  const correction = subtasks.length ? (task.estimatedMinutes ?? subtaskSum) - subtaskSum : 0;
  const doneMinutes = doneSubtasks.reduce((sum, st) => sum + st.estimatedMinutes, 0);

  // 블록을 완료 처리하면 이 블록의 하위 작업도 함께 완료로 맞춘다 (완료 취소 시에는 체크를 건드리지 않는다)
  const markDone = () => {
    const sub = subtasks.find((st) => st.id === block.subtaskId);
    if (sub && status !== 'done' && !isDone(sub)) details.toggleSubtask(sub.id);
    details.setStatus(block.id, 'done');
  };

  return (
    <div className="sheet-backdrop is-above-nav" onClick={onClose}>
      <section className="sheet sheet-auto" onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        <div className="sheet-head">
          <div>
            <span className={`kind-chip tt-${block.kind}`}>{KIND_LABEL[block.kind]}</span>
            <h2>{block.title}</h2>
          </div>
          <div className="sheet-head-actions">
          {(task || isFixed) && (
            <button type="button" className="icon-button" onClick={() => setEditing((v) => !v)} aria-label={task ? '작업 수정' : '일정 수정'} title={task ? '작업 수정' : '일정 수정'} aria-pressed={editing}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
          )}
          {(task || block.source) && block.source !== 'rest' && (
          <button type="button" className="icon-button delete-calendar-button" onClick={remove} disabled={deleting} aria-label={task ? '작업 삭제' : '일정 삭제'} title={task ? '작업 삭제' : '일정 삭제'} aria-busy={deleting}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
            </svg>
          </button>
          )}
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
          </div>
        </div>

        {editing && (task || isFixed) && <CalendarEditDialog block={block} task={task} onClose={() => setEditing(false)} />}

        {deleteError && <p className="field-error" role="alert">{deleteError}</p>}
        {deleting && <p role="status">삭제 중이에요.</p>}
        <dl className="detail-list">
          <div>
            <dt>시간</dt>
            <dd>
              {block.start && block.end ? `${block.start}–${block.end} · ${formatDuration(slotMinutes)}` : '아직 배치된 시간이 없어요'}
            </dd>
          </div>
          {isFixed && block.fixedDate && <div><dt>날짜</dt><dd>{block.fixedDate}</dd></div>}
          {isFixed && !block.fixedDate && block.dayOfWeek?.length > 0 && (
            <div>
              <dt>반복</dt>
              <dd>매주 {block.dayOfWeek.map((day) => '일월화수목금토'[day]).join('·')}</dd>
            </div>
          )}
          {block.location && (
            <div>
              <dt>메모</dt>
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
                  {correction !== 0 && (
                    <small className="estimate-note">
                      하위 작업 합계 {formatDuration(subtaskSum)} {correction > 0 ? '+' : '−'} 내 작업 속도 보정 {formatDuration(Math.abs(correction))}
                    </small>
                  )}
                </dd>
              </div>
              <div>
                <dt>중요도</dt>
                <dd>{PRIORITY_LABEL[task.priority] ?? ({ 3: 'Must', 2: 'Should', 1: 'Could' })[task.importance]}</dd>
              </div>
            </>
          )}
        </dl>

        {task && <ReminderField task={task} />}

        {isFixed && <FixedMemo key={block.id} block={block} />}

        {task && (
          <>
            <div className="subtask-box">
              <div className="subtask-head">
                <h3>하위 작업</h3>
                <div className="subtask-head-right">
                  <button type="button" className="add-subtask-button" onClick={() => setAddingSubtask((v) => !v)} aria-label="하위 작업 추가" aria-expanded={addingSubtask}>
                    +
                  </button>
                  <span>
                    {doneSubtasks.length} / {subtasks.length} 완료
                  </span>
                </div>
              </div>
              <div className="progress">
                <i style={{ width: `${subtasks.length ? (doneSubtasks.length / subtasks.length) * 100 : 0}%` }} />
              </div>
              <ul className="subtask-list">
                {subtasks.map((st) => (
                  <SubtaskRow
                    key={st.id}
                    task={task}
                    subtask={st}
                    done={isDone(st)}
                    highlighted={st.id === block.subtaskId}
                    onToggle={() => details.toggleSubtask(st.id)}
                  />
                ))}
              </ul>
              {addingSubtask && <SubtaskAddForm task={task} onDone={() => setAddingSubtask(false)} />}
            </div>

            <TaskMemo task={task} />

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

            {postponing && (
              <PostponeForm
                block={block}
                onCancel={() => setPostponing(false)}
                onDone={() => {
                  setPostponing(false);
                  onClose();
                }}
              />
            )}

            {block.source && <div className="detail-actions">
              <button
                type="button"
                className={`action-button ${postponing ? 'is-on' : ''}`}
                onClick={() => setPostponing((v) => !v)}
                disabled={status === 'done' || block.source !== 'scheduled'}
              >
                미루기
              </button>
              <button
                type="button"
                className={`action-button action-primary ${status === 'done' ? 'is-on' : ''}`}
                onClick={markDone}
              >
                {status === 'done' ? '완료 취소' : '완료'}
              </button>
            </div>}
          </>
        )}
      </section>
    </div>
  );
}
