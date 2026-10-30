import { useEffect, useState } from 'react';
import SheetHandle from '../common/SheetHandle.jsx';
import {
  EditIcon,
  TrashIcon,
  NoteIcon,
  ClockIcon,
  ArrowRightIcon,
  RepeatIcon,
  CheckIcon,
} from '../common/Icons.jsx';

function formatTimer(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// 오늘 할 일을 누르면 올라오는 액션 시트: 수정·삭제, 메모, 알림, 타이머, 날짜 이동, 루틴
export default function TodoActionSheet({ todo, meta, onPatch, onMove, onClose }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);
  const [timerSec, setTimerSec] = useState(null); // null: 꺼짐, 숫자: 경과 초
  const [running, setRunning] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');

  const openMemo = () => {
    setMemoDraft(meta.memo ?? '');
    setMemoOpen(true);
  };

  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const saveTitle = () => {
    if (draft.trim()) onPatch({ title: draft.trim() });
    setEditing(false);
  };

  const toggleTimer = () => {
    if (timerSec === null) {
      setTimerSec(0);
      setRunning(true);
    } else {
      setRunning((r) => !r);
    }
  };

  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet sheet-auto todo-sheet" onClick={(e) => e.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        <div className="todo-sheet-title">
          <h2>{meta.title ?? todo.title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {editing ? (
          <div className="todo-edit">
            <input
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveTitle()}
            />
            <button type="button" onClick={saveTitle}>
              저장
            </button>
          </div>
        ) : null}

        <div className="todo-sheet-top">
          <button type="button" className="big-action" onClick={() => setEditing(true)}>
            <span style={{ color: '#4f6bff' }}>
              <EditIcon size={30} />
            </span>
            수정하기
          </button>
          <button
            type="button"
            className="big-action"
            onClick={() => onMove('삭제했어요')}
          >
            <span style={{ color: '#ff5a5f' }}>
              <TrashIcon size={30} />
            </span>
            삭제하기
          </button>
        </div>

        <button type="button" className="sheet-row" onClick={openMemo}>
          <span className="row-icon" style={{ background: '#ffd21f' }}>
            <NoteIcon size={20} />
          </span>
          메모
        </button>
        {meta.memo && (
          <button type="button" className="memo-preview" onClick={openMemo}>
            {meta.memo}
          </button>
        )}

        <button type="button" className="sheet-row" onClick={() => onPatch({ alarm: !meta.alarm })}>
          <span className="row-icon" style={{ background: '#f06bf0' }}>
            <ClockIcon size={20} />
          </span>
          시간 알림
          {meta.alarm && <em>{todo.start} 10분 전 · 켜짐</em>}
        </button>

        <button type="button" className="sheet-row" onClick={toggleTimer}>
          <span className="row-icon" style={{ background: '#f06bf0' }}>
            <ClockIcon size={20} />
          </span>
          {timerSec === null ? '타이머 열기' : running ? '타이머 정지' : '타이머 다시 시작'}
          {timerSec !== null && <em>{formatTimer(timerSec)}</em>}
        </button>

        <button
          type="button"
          className="sheet-row"
          onClick={() =>
            onMove('내일로 옮겼어요', tomorrow().toISOString().slice(0, 10))
          }
        >
          <span className="row-icon" style={{ background: '#6a6cf0' }}>
            <ArrowRightIcon size={20} />
          </span>
          내일 하기
        </button>

        <label className="sheet-row">
          <span className="row-icon" style={{ background: '#6a6cf0' }}>
            <RepeatIcon size={20} />
          </span>
          날짜 바꾸기
          <input
            type="date"
            className="row-date"
            onChange={(e) => e.target.value && onMove(`${e.target.value}로 옮겼어요`, e.target.value)}
          />
        </label>

        <button type="button" className="sheet-row" onClick={() => onPatch({ routine: !meta.routine })}>
          <span className="row-icon" style={{ background: '#6a6cf0' }}>
            <CheckIcon size={20} />
          </span>
          루틴 등록하기
          {meta.routine && <em>등록됨</em>}
        </button>
      </section>

      {memoOpen && (
        <div
          className="sheet-backdrop memo-layer"
          onClick={(e) => {
            e.stopPropagation();
            setMemoOpen(false);
          }}
        >
          <section className="sheet sheet-auto memo-sheet" onClick={(e) => e.stopPropagation()}>
            <SheetHandle onClose={() => setMemoOpen(false)} />
            <div className="memo-bar">
              <button
                type="button"
                className="memo-delete"
                onClick={() => {
                  onPatch({ memo: '' });
                  setMemoOpen(false);
                }}
              >
                삭제
              </button>
              <h2>할일</h2>
              <button
                type="button"
                onClick={() => {
                  onPatch({ memo: memoDraft.trim() });
                  setMemoOpen(false);
                }}
              >
                완료
              </button>
            </div>
            <textarea
              className="todo-memo memo-editor"
              autoFocus
              rows={8}
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
            />
          </section>
        </div>
      )}
    </div>
  );
}
