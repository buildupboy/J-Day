import { useEffect, useRef, useState } from 'react';
import { WEEKDAYS } from './WeekTimetable.jsx';
import { lessonConflicts } from '../../utils/timetableConflicts.js';

export default function LessonEditor({ lesson, isNew, onApply, onDelete, onClose, otherLessons = [] }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(() => ({ ...lesson, dayOfWeek: [...lesson.dayOfWeek] }));
  const [error, setError] = useState('');
  const overlaps = lessonConflicts(draft, otherLessons);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  const change = (patch) => { setDraft((value) => ({ ...value, ...patch })); setError(''); };
  function submit(event) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.dayOfWeek.length || !draft.start || !draft.end || draft.start >= draft.end) {
      setError('일정 이름과 요일을 선택하고, 종료 시간을 시작 시간보다 늦게 입력해 주세요.');
      return;
    }
    if (overlaps.length) { setError('겹치는 일정이 있어요. 다른 요일이나 시간으로 변경해 주세요.'); return; }
    onApply({ ...draft, title: draft.title.trim(), location: (draft.location || '').trim() });
  }
  return <dialog className="my-dialog lesson-editor" ref={dialog} aria-labelledby="lesson-editor-title" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="my-dialog-heading"><h2 id="lesson-editor-title">{isNew ? '일정 추가' : '일정 수정'}</h2><button type="button" onClick={onClose} aria-label="닫기">×</button></div>
    <form onSubmit={submit} className="fixed-lesson lesson-editor-form">
      <label>일정 이름<input autoFocus required maxLength={100} placeholder="일정 이름" value={draft.title} onChange={(event) => change({ title: event.target.value })} /></label>
      <label>장소<input maxLength={150} placeholder="예: 공학관 205" value={draft.location || ''} onChange={(event) => change({ location: event.target.value })} /></label>
      <div className="fixed-days" role="group" aria-label="반복 요일">{[1,2,3,4,5,6,0].map((day) => <button type="button" key={day} aria-pressed={draft.dayOfWeek.includes(day)} onClick={() => change({ dayOfWeek: draft.dayOfWeek.includes(day) ? draft.dayOfWeek.filter((value) => value !== day) : [...draft.dayOfWeek, day] })}>{WEEKDAYS[day]}</button>)}</div>
      <div className="fixed-times"><label>시작<input type="time" required value={draft.start} onChange={(event) => change({ start: event.target.value })} /></label><label>종료<input type="time" required value={draft.end} onChange={(event) => change({ end: event.target.value })} /></label></div>
      {error && <p className="fixed-error" role="alert">{error}</p>}
      {overlaps.length > 0 && <div className="fixed-error" role="status">이 시간에는 다른 일정이 있어요.<ul>{overlaps.map((item, index) => <li key={item.id || index}>{item.title} · {item.dayOfWeek.filter((day) => draft.dayOfWeek.includes(day)).map((day) => WEEKDAYS[day]).join('·')} {item.start}–{item.end}</li>)}</ul></div>}
      {!isNew && <button type="button" className="fixed-delete" onClick={() => onDelete(draft.id)}>일정 삭제</button>}
      <div className="lesson-editor-actions"><button type="button" className="fixed-add" onClick={onClose}>취소</button><button type="submit" className="primary-button" disabled={overlaps.length > 0}>{isNew ? '추가하기' : '수정 적용'}</button></div>
      <p className="analysis-note">시간표에 적용한 뒤 ‘고정 시간표 저장하기’를 눌러 저장해 주세요.</p>
    </form>
  </dialog>;
}
