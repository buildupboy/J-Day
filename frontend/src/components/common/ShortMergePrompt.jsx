import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { onReschedulingChange } from '../../api/rescheduling.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';

// 재배치로 30분 미만 작업이 쉬는 시간만 두고 이어지면, 어느 화면에서든 이어서 할지 묻는 팝업.
// 일정이 바뀔 때마다 서버의 후보를 다시 조회한다. showModal이라 다른 오버레이 위에 뜬다.
export default function ShortMergePrompt() {
  const [group, setGroup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const element = useRef(null);
  const later = useRef(new Set()); // 이번 접속에서 '나중에'를 고른 묶음
  const timer = useRef(null);

  const check = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const { groups } = await api.getMergeSuggestions();
        const next = groups.find((item) => !later.current.has(item.id)) ?? null;
        setGroup((previous) => (previous?.id === next?.id ? previous : next));
      } catch {
        // 제안은 부가 기능이라 조회 실패는 조용히 넘긴다
      }
    }, 400);
  }, []);

  useEffect(() => {
    check();
    window.addEventListener('schedule-changed', check);
    const stopWatching = onReschedulingChange((running) => { if (!running) check(); });
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('schedule-changed', check);
      stopWatching();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  useEffect(() => {
    const dialog = element.current;
    if (!group || !dialog) return undefined;
    dialog.showModal();
    return () => dialog.close();
  }, [group]);

  const answer = async (action) => {
    if (busy || !group) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'merge') await api.mergeShortBlocks(group.blockIds);
      else if (action === 'decline') await api.declineShortMerge(group.id);
      else later.current.add(group.id);
      setGroup(null);
      if (action === 'merge') scheduleChanged();
      else check();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!group) return null;
  return (
    <dialog ref={element} className="my-dialog app-message-dialog" aria-labelledby="short-merge-title"
      onCancel={(event) => { event.preventDefault(); answer('later'); }}>
      <h2 id="short-merge-title">짧은 작업이 이어져 있어요</h2>
      <p>{group.question}</p>
      <p className="d-meta">이어서 하면 ‘기타 작업’ 하나로 묶고 사이 쉬는 시간을 빼요.</p>
      {error && <p role="alert" className="d-meta">{error}</p>}
      <div className="app-message-actions">
        <button type="button" className="d-btn d-btn-line" disabled={busy} onClick={() => answer('later')}>나중에</button>
        <button type="button" className="d-btn d-btn-line" disabled={busy} onClick={() => answer('decline')}>그대로 둘게요</button>
        <button type="button" className="d-btn d-btn-dark" disabled={busy} autoFocus onClick={() => answer('merge')}>이어서 할게요</button>
      </div>
    </dialog>
  );
}
