import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { getWeekDays, getMonthGrid, addDays } from '../utils/calendar.js';

export const scheduleChanged = () => window.dispatchEvent(new Event('schedule-changed'));
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// 샘플로 대체하지 않는다. 쓰기 성공 후 서버에 저장된 타임라인을 다시 조회한다.
export default function useLiveSchedule(selected, view = 'week') {
  const range = view === 'month' ? getMonthGrid(selected.getFullYear(), selected.getMonth()) : getWeekDays(selected);
  const from = dateKey(range[0]), to = dateKey(range.at(-1));
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ tasks: [], days: [], loading: true, error: null });
  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    window.addEventListener('schedule-changed', update);
    return () => window.removeEventListener('schedule-changed', update);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setState(previous => ({ ...previous, loading: true, error: null }));
    const starts = [];
    for (let cursor = new Date(`${from}T00:00:00`); dateKey(cursor) <= to; cursor = addDays(cursor, 7)) starts.push(dateKey(cursor));
    Promise.all([api.getTasks(), ...starts.map(day => api.getWeekSchedule(day))])
      .then(([tasks, ...weeks]) => { if (!cancelled) setState({ tasks, days: weeks.flatMap(week => week.days), loading: false, error: null }); })
      .catch(error => { if (!cancelled) setState({ tasks: [], days: [], loading: false, error: error.message }); });
    return () => { cancelled = true; };
  }, [from, to, revision]);
  const taskById = id => state.tasks.find(task => task.id === id) ?? null;
  // 같은 상위 작업의 하위작업 블록은 바로 이어지는 것끼리 하나로 묶어 상위 작업 이름으로 보여 준다
  const groupByTask = items => items.reduce((out, block) => {
    const prev = out.at(-1);
    if (prev && block.source === 'scheduled' && prev.source === 'scheduled' && prev.taskId === block.taskId) {
      prev.end = block.end;
      prev.parts.push(block);
      return out;
    }
    out.push({ ...block, parts: [block] });
    return out;
  }, []);
  const blocksForDate = date => groupByTask([...(state.days.find(day => day.date === dateKey(date))?.items ?? [])].sort((a, b) => a.start.localeCompare(b.start))).map(block => ({
    ...block, date: dateKey(date), fixedKind: block.kind, kind: block.source === 'scheduled' ? 'task' : block.source === 'rest' ? 'break' : block.kind === 'routine' ? 'routine' : 'fixed',
    task: taskById(block.taskId), note: block.status === 'missed' ? '미수행' : block.source === 'scheduled' ? '자동 배치' : undefined,
    ...(block.source === 'scheduled' && taskById(block.taskId) ? { title: taskById(block.taskId).title } : {}),
    ...(block.parts.length > 1 && block.parts.every(part => part.status === 'done') ? { status: 'done' } : {}),
  }));
  return { ...state, taskById, blocksForDate };
}
