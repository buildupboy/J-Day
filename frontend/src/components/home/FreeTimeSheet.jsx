import { useState } from 'react';
import { api } from '../../api/client.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';
import { CloseIcon, PlusIcon } from '../common/Icons.jsx';
import { fromMinutes, formatDuration } from '../../utils/time.js';
import { josa } from '../../utils/labels.js';

const NIGHT_FROM = 22 * 60; // 이 시각 이후 틈은 쉬기를 권한다

// 01-3 오늘의 여유 시간: 지금 이후 빈 시간대와 제이의 한마디. slots는 { start, end, minutes, before, after }
export default function FreeTimeSheet({ slots, total, minGap, suggestTask, nav, onClose }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const day = slots.find((s) => s.start < NIGHT_FROM);
  const night = slots.some((s) => s.start >= NIGHT_FROM);
  const tip = [
    day && suggestTask
      ? `${fromMinutes(day.start).replace(/^0/, '')}부터 ${formatDuration(day.minutes)}은 ${josa(suggestTask, '을', '를')} 조금 당겨 두기 좋아요.`
      : day
        ? `${fromMinutes(day.start).replace(/^0/, '')}부터 ${formatDuration(day.minutes)}은 미뤄 둔 일을 하기 좋아요.`
        : '',
    night ? '밤 시간은 쉬는 걸 추천해요.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // 남은 작업을 지금 이후 빈 시간에 다시 배치한다
  const fill = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await api.reschedule('manual');
      scheduleChanged();
      const moved = (res.changes ?? []).filter((c) => c.type !== 'removed').length;
      setMessage(moved ? `작업 ${moved}개를 빈 시간에 다시 배치했어요.` : '이미 남은 작업이 빈 시간에 잘 배치돼 있어요.');
    } catch (err) {
      setMessage(`배치하지 못했어요. ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-sheet-backdrop" onClick={onClose}>
      <section className="d-sheet" aria-label="오늘의 여유 시간" onClick={(e) => e.stopPropagation()}>
        <span className="d-sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <p className="d-sub">오늘의 여유 시간</p>
            <h2 className="sheet-big">{formatDuration(total)}</h2>
            <p className="d-meta">지금 일정 기준, 오늘 더 쓸 수 있는 시간이에요</p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="닫기">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="d-section">
          <h3 className="sheet-h3">여유 시간대</h3>
          {slots.length ? (
            <ul className="soft-list">
              {slots.map((s) => (
                <li key={s.start} className="slot-row">
                  <span className="slot-time">
                    {fromMinutes(s.start)} – {fromMinutes(s.end % (24 * 60))}
                  </span>
                  <span className="slot-where">
                    {[s.before && `${s.before} 후`, s.after && `${s.after} 전`].filter(Boolean).join(' · ') || '빈 시간'}
                  </span>
                  <span className="slot-min">{formatDuration(s.minutes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="soft-list soft-empty">오늘은 더 쓸 수 있는 빈 시간이 없어요.</p>
          )}
          <p className="d-meta">{minGap}분보다 짧은 틈은 휴식으로 두고 세지 않아요</p>
        </div>

        {tip && (
          <div className="j-tip">
            <span className="j-mark" aria-hidden="true">
              J
            </span>
            <p>{tip}</p>
          </div>
        )}
        {message && (
          <p className="d-meta" role="status">
            {message}
          </p>
        )}

        <div className="d-grid-2">
          <button type="button" className="d-btn d-btn-line d-btn-md" onClick={() => nav.open('addTask')}>
            <PlusIcon size={16} />
            새 작업 추가
          </button>
          <button type="button" className="d-btn d-btn-dark d-btn-md" disabled={busy} onClick={fill}>
            {busy ? '배치하는 중…' : '남은 작업 채우기'}
          </button>
        </div>
      </section>
    </div>
  );
}
