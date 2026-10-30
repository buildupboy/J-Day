import { useState } from 'react';
import { api } from '../../api/client.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';
import { queueReschedule, cancelQueuedReschedule, EDIT_DELAY_MS } from '../../hooks/useDeferredReschedule.js';
import { offerUndo, markPending, isPending, notify, usePendingChanges } from '../../hooks/useUndo.js';
import { toMinutes, formatDuration, distributeMinutes } from '../../utils/time.js';
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
  sleep: '수면',
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
  usePendingChanges();
  // 작업 블록의 삭제는 상위 작업 전체를, 그 외(고정 시간·루틴)는 그 날짜의 일정만 지운다
  const remove = async () => {
    const message = task
      ? `‘${task.title}’ 작업을 삭제할까요? 하위 작업과 캘린더에 배치된 블록이 모두 사라져요.`
      : `‘${block.title}’ 일정을 캘린더에서 삭제할까요?`;
    if (!(await confirm(message))) return;
    if (task) {
      // 작업 삭제는 실행 취소를 기다린 뒤 보낸다. 그동안 화면에서는 지운 것처럼 보인다
      const key = `task:${task.id}`;
      markPending(key, true);
      // 지운 작업이 쓰던 시간은 30초 뒤 다시 배치한다
      const request = queueReschedule({ delayMs: EDIT_DELAY_MS, reason: 'manual' });
      offerUndo({
        message: `'${task.title}' 작업을 삭제했어요`,
        undo: () => {
          markPending(key, false);
          cancelQueuedReschedule(request);
        },
        commit: async () => {
          try {
            await api.deleteTask(task.id);
            scheduleChanged();
          } catch (error) {
            markPending(key, false);
            notify(`삭제하지 못했어요. ${error.message}`);
          }
        },
      });
      onClose();
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await api.deleteCalendarItem(block.source, block.id, block.date);
      scheduleChanged();
      onClose();
    } catch (error) {
      setDeleteError(`삭제하지 못했어요. ${error.message}`);
      setDeleting(false);
    }
  };
  // 캘린더는 이어지는 하위 작업 블록을 하나로 묶어 보여 주므로, 사이의 쉬는 시간을 뺀 실제 작업 시간으로 센다
  const parts = block.parts ?? [block];
  const partMinutes = (part) => (part.start && part.end ? toMinutes(part.end) - toMinutes(part.start) : 0);
  const slotMinutes = block.start && block.end ? parts.reduce((sum, part) => sum + partMinutes(part), 0) : 0;
  const status = details.statusOf(block.id);

  const taskDone = task?.status === 'done' || status === 'done' || (task && isPending(`taskDone:${task.id}`));
  const isDone = (st) => taskDone || st.done !== details.toggled.has(st.id);
  // 실행 취소를 기다리는 하위 작업 삭제는 먼저 지운 것처럼 보여 준다
  const subtasks = (task?.subtasks ?? []).filter((st) => !isPending(`subtask:${st.id}`));
  const doneSubtasks = subtasks.filter(isDone);
  // 총 시간은 유형별 개인 보정(지난 수행 기록 기준)을 적용한 전체 작업 시간이고,
  // 하위 작업 시간은 이 총 시간을 나눈 값이라 합이 배치된 블록 시간의 합과 같다
  const subtaskMinutes = task && subtasks.length ? distributeMinutes(task.estimatedMinutes, subtasks) : [];
  const doneMinutes = subtasks.reduce((sum, st, i) => sum + (isDone(st) ? subtaskMinutes[i] : 0), 0);

  // 작업 전체를 완료한다. 서버가 하위 작업을 모두 완료로 바꾸고, 남은 배치 시간은 30초 뒤 재배치 때 비운다.
  // 실행 취소를 기다린 뒤 보내고, 그동안은 완료된 것처럼 보여 준다
  const markDone = () => {
    const key = `taskDone:${task.id}`;
    markPending(key, true);
    const request = queueReschedule({ delayMs: EDIT_DELAY_MS, reason: 'progress' });
    offerUndo({
      message: `'${task.title}' 작업을 완료했어요`,
      undo: () => {
        markPending(key, false);
        cancelQueuedReschedule(request);
      },
      commit: async () => {
        try {
          await api.reportProgress(task.id, {
            progress: 1,
            reschedule: false,
            ...(block.source === 'scheduled' && block.status !== 'done' ? { blockId: block.id, blockStatus: 'done' } : {}),
          });
          scheduleChanged();
        } catch (error) {
          markPending(key, false);
          notify(`완료하지 못했어요. ${error.message}`);
        }
      },
    });
  };

  return (
    <div className="sheet-backdrop is-above-nav" onClick={onClose}>
      <section className="sheet sheet-auto" onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        <div className="sheet-head">
          <div>
            <span className={`kind-chip tt-${block.kind}`}>{KIND_LABEL[block.kind]}</span>
            {/* 작업은 하위작업 대신 상위 작업 이름을 쓴다. 이 시간에 할 하위작업은 목록에 표시된다 */}
            <h2>{task ? task.title : block.title}</h2>
          </div>
          <div className="sheet-head-actions">
          {(task || isFixed) && (
            <button type="button" className="icon-button" onClick={() => setEditing((v) => !v)} aria-label={task ? '작업 수정' : '일정 수정'} title={task ? '작업 수정' : '일정 수정'} aria-pressed={editing}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
              </svg>
            </button>
          )}
          {(task || block.source) && block.source !== 'rest' && block.source !== 'sleep' && (
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
                {subtasks.map((st, i) => (
                  <SubtaskRow
                    key={st.id}
                    task={task}
                    subtask={st}
                    minutes={subtaskMinutes[i]}
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
                disabled={taskDone || block.source !== 'scheduled'}
              >
                미루기
              </button>
              <button
                type="button"
                className={`action-button action-primary ${taskDone ? 'is-on' : ''}`}
                onClick={markDone}
                disabled={taskDone}
              >
                {taskDone ? '완료한 작업' : '완료'}
              </button>
            </div>}
          </>
        )}
      </section>
    </div>
  );
}
