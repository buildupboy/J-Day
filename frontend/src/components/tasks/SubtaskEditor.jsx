import { useState } from 'react';
import { CloseIcon, PlusIcon } from '../common/Icons.jsx';
import { DurationWheels, durationText } from '../common/DateTimeRows.jsx';
import { formatDuration } from '../../utils/time.js';

const MAX_SUBTASKS = 20;

/** 화면에서 쓰는 하위작업 한 줄. key는 목록 렌더링용이라 저장할 때는 뺀다 */
export const newSubtask = (title = '', estimatedMinutes = 0) => ({ key: crypto.randomUUID(), title, estimatedMinutes });

/**
 * 저장용 하위작업 목록으로 정리한다. 제목이 빈 줄은 버리고,
 * 모두 0분이면 전체 예상 시간을 고르게 나눠 넣는다 (서버는 합계 0분을 거부한다).
 */
export function toSavedSubtasks(subtasks, totalMinutes) {
  const filled = subtasks
    .filter((s) => s.title.trim())
    .map((s) => ({ title: s.title.trim(), estimatedMinutes: Math.max(0, Math.round(Number(s.estimatedMinutes) || 0)) }));
  if (filled.length && totalMinutes > 0 && filled.every((s) => s.estimatedMinutes === 0)) {
    const each = Math.floor(totalMinutes / filled.length);
    return filled.map((s, i) => ({ ...s, estimatedMinutes: i === filled.length - 1 ? totalMinutes - each * i : each }));
  }
  return filled;
}

// 하위작업 목록: 이름을 적고, 시간 칩을 누르면 그 줄 아래에 시간·분 휠이 펼쳐진다
export default function SubtaskEditor({ subtasks, onChange, totalMinutes, onUseSum }) {
  const [openKey, setOpenKey] = useState(null);
  const update = (key, patch) => onChange(subtasks.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const sum = subtasks.reduce((n, s) => n + (s.title.trim() ? Number(s.estimatedMinutes) || 0 : 0), 0);

  return (
    <div className="sub-editor">
      {subtasks.length > 0 && (
        <ul className="d-card sub-list">
          {subtasks.map((s, i) => (
            <li key={s.key} className="sub-item">
              <div className="sub-row">
                <span className="sub-index" aria-hidden="true">
                  {i + 1}
                </span>
                <input
                  className="sub-title"
                  value={s.title}
                  placeholder="예: 자료 조사"
                  aria-label={`하위작업 ${i + 1} 이름`}
                  onChange={(e) => update(s.key, { title: e.target.value })}
                />
                <button
                  type="button"
                  className={`dt-chip sub-time ${openKey === s.key ? 'is-on' : ''} ${Number(s.estimatedMinutes) ? '' : 'is-empty'}`}
                  aria-expanded={openKey === s.key}
                  aria-label={`하위작업 ${i + 1} 걸릴 시간`}
                  onClick={() => setOpenKey((k) => (k === s.key ? null : s.key))}
                >
                  {durationText(Number(s.estimatedMinutes) || 0) || '시간'}
                </button>
                <button
                  type="button"
                  className="sub-remove"
                  aria-label={`하위작업 ${i + 1} 삭제`}
                  onClick={() => onChange(subtasks.filter((x) => x.key !== s.key))}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              {openKey === s.key && (
                <div className="dt-panel">
                  <DurationWheels
                    value={Number(s.estimatedMinutes) || 0}
                    onChange={(total) => update(s.key, { estimatedMinutes: total })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="sub-add"
        disabled={subtasks.length >= MAX_SUBTASKS}
        onClick={() => onChange([...subtasks, newSubtask()])}
      >
        <PlusIcon size={16} />
        하위작업 추가
      </button>
      {sum > 0 && sum !== totalMinutes && (
        <p className="d-meta sub-sum">
          하위작업 합계 {formatDuration(sum)}
          {totalMinutes > 0 ? ` · 예상 시간 ${formatDuration(totalMinutes)}과 달라요` : ''}{' '}
          <button type="button" className="d-link" onClick={() => onUseSum(sum)}>
            합계로 맞추기
          </button>
        </p>
      )}
      {sum === 0 && subtasks.some((s) => s.title.trim()) && totalMinutes > 0 && (
        <p className="d-meta sub-sum">시간을 비워 두면 예상 시간을 하위작업에 고르게 나눠요.</p>
      )}
    </div>
  );
}
