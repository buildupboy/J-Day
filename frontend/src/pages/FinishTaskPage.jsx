import { useState } from 'react';
import { api } from '../api/client.js';
import { scheduleChanged } from '../hooks/useLiveSchedule.js';
import { CheckIcon, ChevronLeftIcon, MicIcon } from '../components/common/Icons.jsx';
import { toMinutes, fromMinutes, formatDuration } from '../utils/time.js';
import { FIXED_KIND_LABEL, josa } from '../utils/labels.js';

const ON_TIME_MARGIN = 5; // 예정 종료와 이 시간(분) 안쪽 차이면 예정대로 끝난 것으로 본다

const hourText = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (m === 30) return `${h}시 반`;
  return m ? `${h}시 ${m}분` : `${h}시`;
};

// 06-3 작업 종료: 예정보다 일찍/늦게 끝난 만큼 남은 시간을 정하고 뒤 작업을 다시 배치한다.
// 진행 보고(PATCH /api/tasks/:id/progress)를 보내면 서버가 지금 시각 이후의 작업을 재배치한다.
// 끝낸 블록은 원래 종료 시각을 유지하므로, 일찍 끝나면 남은 시간이 비고 늦게 끝나면 뒤 작업이 밀린다.
export default function FinishTaskPage({ block, blocks, taskById, nav, onClose }) {
  const [now] = useState(() => new Date());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  const planned = end - start;
  const actual = Math.max(1, nowMin - start);
  const diff = end - nowMin; // 양수: 일찍, 음수: 늦게
  const mode = diff > ON_TIME_MARGIN ? 'early' : diff < -ON_TIME_MARGIN ? 'late' : 'onTime';

  const later = blocks
    .filter((b) => b.id !== block.id && toMinutes(b.start) >= Math.min(end, nowMin))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const nextFixed = later.find((b) => b.kind !== 'task');
  const nextTask = later.find((b) => b.kind === 'task');
  const restUntil = nextFixed ? Math.max(toMinutes(nextFixed.start), end) : end;

  const finish = async (choice) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.reportProgress(block.taskId, {
        blockId: block.id,
        blockStatus: 'done',
        actualMinutes: (block.task?.actualMinutes ?? 0) + actual,
        ...(block.subtaskId ? { subtaskId: block.subtaskId, subtaskDone: true } : {}),
      });
      scheduleChanged();
      const moved = (res.changes ?? []).filter((c) => c.type !== 'removed' && c.after && c.after.status === 'planned');
      setResult({ choice, moved, unplaced: res.unplaced ?? [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (result) return <FinishResult block={block} result={result} taskById={taskById} onDone={onClose} />;

  const nextLabel = nextFixed
    ? `${hourText(nextFixed.start)} ${FIXED_KIND_LABEL[nextFixed.fixedKind] ?? nextFixed.title} 전까지`
    : '다음 일정 전까지';

  return (
    <div className="d-form-page finish">
      <header className="finish-bar">
        <button type="button" className="d-icon-btn" onClick={onClose} aria-label="뒤로">
          <ChevronLeftIcon size={20} />
        </button>
        <h1>작업 종료</h1>
      </header>

      <section className="d-card finish-card">
        <span className="finish-check" aria-hidden="true">
          <CheckIcon size={20} />
        </span>
        <div>
          <h2>{block.title}</h2>
          <p className="d-meta">
            {fromMinutes(nowMin)} 종료 · 예상 {formatDuration(planned)} → 실제 {formatDuration(actual)}
          </p>
        </div>
      </section>

      {mode === 'early' && (
        <p className="finish-lead">
          <b className="is-early">{formatDuration(diff)} 일찍</b> 끝났어요. {nextLabel} 남은 {formatDuration(restUntil - nowMin)}, 어떻게
          할까요?
        </p>
      )}
      {mode === 'late' && (
        <p className="finish-lead">
          <b className="is-late">{formatDuration(-diff)} 늦게</b> 끝났어요. 늦어진 만큼 뒤 작업을 어떻게 할까요?
        </p>
      )}
      {mode === 'onTime' && <p className="finish-lead">예정대로 끝났어요. 수고했어요!</p>}

      {error && (
        <p className="d-error" role="alert">
          종료하지 못했어요. {error}
        </p>
      )}

      <div className="finish-options">
        {mode === 'early' && (
          <>
            <button type="button" className="d-card finish-option" disabled={saving} onClick={() => finish('rest')}>
              <span className="finish-option-head">
                <strong>쉬는 시간으로 둘게</strong>
                <span>
                  {fromMinutes(nowMin)} – {fromMinutes(restUntil)}
                </span>
              </span>
              <span className="d-meta">뒤 일정은 그대로 두고 쉬어요</span>
            </button>
            <button type="button" className="d-card finish-option" disabled title="서버에 블록을 줄이는 기능이 필요해요">
              <span className="finish-option-head">
                <strong>다음 작업 당겨 줘</strong>
                <span className="d-chip is-could">준비 중</span>
              </span>
              <span className="d-meta">
                {nextTask
                  ? `${josa(nextTask.title, '을', '를')} 지금 ${formatDuration(Math.min(diff, toMinutes(nextTask.end) - toMinutes(nextTask.start)))} 먼저 해요`
                  : '남은 작업을 지금부터 앞당겨 해요'}
              </span>
            </button>
          </>
        )}
        {mode === 'late' && (
          <button type="button" className="d-card finish-option" disabled={saving} onClick={() => finish('push')}>
            <span className="finish-option-head">
              <strong>뒤 작업 다시 배치해 줘</strong>
              <span>{fromMinutes(nowMin)} 이후</span>
            </span>
            <span className="d-meta">
              {nextTask
                ? `${nextTask.title}부터 빈 시간에 다시 넣어요. 수업·알바 같은 고정 일정은 그대로예요`
                : '남은 작업을 지금 이후 빈 시간에 다시 넣어요'}
            </span>
          </button>
        )}
        {mode === 'onTime' && (
          <button type="button" className="d-btn d-btn-dark d-btn-lg" disabled={saving} onClick={() => finish('done')}>
            완료로 기록하기
          </button>
        )}
      </div>

      <p className="d-meta finish-note">
        {saving ? '기록하고 다시 배치하는 중이에요…' : `이번 기록은 다음 ${block.task?.title ?? '같은 종류'} 작업의 예상 시간에 반영돼요.`}
      </p>

      <div className="finish-foot">
        <button type="button" className="finish-voice" onClick={() => nav.open('voice')}>
          <MicIcon size={18} />
          말로 해도 돼요 · “{mode === 'late' ? '뒤 작업 미뤄 줘' : '쉬는 시간으로 해 줘'}”
        </button>
      </div>
    </div>
  );
}

// 종료 후: 기록 결과와 다시 배치된 블록
function FinishResult({ block, result, taskById, onDone }) {
  const titleOf = (b) => {
    const task = taskById?.(b.taskId);
    return task?.subtasks?.find((s) => s.id === b.subtaskId)?.title ?? task?.title ?? '작업';
  };
  const title = { rest: '남은 시간은 쉬는 시간으로 두었어요', push: '뒤 작업을 다시 배치했어요', done: '완료로 기록했어요' }[result.choice];
  const moved = result.moved.slice(0, 6);
  return (
    <div className="d-form-page finish">
      <header className="finish-bar">
        <h1>작업 종료</h1>
      </header>
      <section className="d-card finish-card">
        <span className="finish-check" aria-hidden="true">
          <CheckIcon size={20} />
        </span>
        <div>
          <h2>{block.title}</h2>
          <p className="d-meta">{title}</p>
        </div>
      </section>

      {moved.length > 0 ? (
        <section className="d-section" aria-label="바뀐 일정">
          <h2 className="d-h2">바뀐 일정</h2>
          <ul className="d-card d-list">
            {moved.map((c) => (
              <li key={c.after.id} className="moved-row">
                <span className="moved-title">{titleOf(c.after)}</span>
                <span className="d-meta">
                  {c.before ? `${c.before.date.slice(5).replace('-', '/')} ${c.before.start} → ` : '새로 · '}
                  {c.after.date.slice(5).replace('-', '/')} {c.after.start}–{c.after.end}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="d-meta">뒤 일정은 바뀌지 않았어요.</p>
      )}
      {result.unplaced.length > 0 && (
        <p className="d-alert" role="status">
          마감 전까지 넣지 못한 작업 시간이 있어요. 일정 탭에서 확인해 주세요.
        </p>
      )}

      <div className="d-form-foot">
        <button type="button" className="d-btn d-btn-dark d-btn-lg" onClick={onDone}>
          확인
        </button>
      </div>
    </div>
  );
}
