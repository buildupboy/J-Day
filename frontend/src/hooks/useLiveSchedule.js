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
  const blocksForDate = date => (state.days.find(day => day.date === dateKey(date))?.items ?? []).map(block => ({
    ...block, date: dateKey(date), kind: block.source === 'scheduled' ? 'task' : block.kind === 'routine' ? 'routine' : 'fixed',
    task: taskById(block.taskId), note: block.status === 'missed' ? '미수행' : block.source === 'scheduled' ? '자동 배치' : undefined,
  }));
  return { ...state, taskById, blocksForDate };
}
