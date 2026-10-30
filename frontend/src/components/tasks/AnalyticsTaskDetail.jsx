import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import TaskDetailSheet from './TaskDetailSheet.jsx';

// 분석에서 선택한 기간의 배치와 최신 작업 정보를 함께 조회한다. 저장·AI 호출은 없다.
export default function AnalyticsTaskDetail({ taskId, from, to, onClose }) {
  const [state, setState] = useState({ loading: true, task: null, blocks: [], error: '' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true, task: null, blocks: [], error: '' });
    const starts = [];
    for (const date = new Date(from + 'T00:00:00Z'); date.toISOString().slice(0, 10) <= to; date.setUTCDate(date.getUTCDate() + 7)) starts.push(date.toISOString().slice(0, 10));
    Promise.all([api.getTasks(), ...starts.map(start => api.getWeekSchedule(start))])
      .then(([tasks, ...weeks]) => {
        if (!active) return;
        const task = tasks.find(item => item.id === taskId);
        if (!task) throw new Error('이 작업을 찾을 수 없어요. 삭제되었거나 변경되었을 수 있어요.');
        const blocks = [...new Map(weeks.flatMap(week => week.days.flatMap(day => day.items
          .filter(item => item.source === 'scheduled' && item.taskId === taskId && day.date >= from && day.date <= to)
          .map(item => ({ ...item, date: day.date })))).map(block => [block.id, block])).values()]
          .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
        setState({ loading: false, task, blocks, error: '' });
      })
      .catch(error => { if (active) setState({ loading: false, task: null, blocks: [], error: error.message }); });
    return () => { active = false; };
  }, [taskId, from, to, retry]);
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (state.task) return <TaskDetailSheet task={state.task} blocks={state.blocks} periodLabel="선택한 기간" onClose={onClose} />;
  return <div className="sheet-backdrop" onClick={onClose}>
    <section className="sheet sheet-auto" role="dialog" aria-modal="true" aria-label="작업 상세" onClick={event => event.stopPropagation()}>
      <div className="sheet-head"><h2>작업 상세</h2><button type="button" className="icon-button" onClick={onClose} aria-label="닫기">✕</button></div>
      {state.loading ? <p role="status">작업 정보를 불러오는 중이에요…</p> : <><p role="alert">{state.error}</p><button type="button" className="primary-button" onClick={() => setRetry(value => value + 1)}>다시 시도</button></>}
    </section>
  </div>;
}
