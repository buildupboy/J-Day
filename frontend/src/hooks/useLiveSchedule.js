import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { getWeekDays, getMonthGrid, addDays } from '../utils/calendar.js';
import { isPending, usePendingChanges } from './useUndo.js';

export const scheduleChanged = () => window.dispatchEvent(new Event('schedule-changed'));
export const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// 샘플로 대체하지 않는다. 쓰기 성공 후 서버에 저장된 타임라인을 다시 조회한다.
export default function useLiveSchedule(selected, view = 'week') {
  const range = view === 'month' ? getMonthGrid(selected.getFullYear(), selected.getMonth()) : getWeekDays(selected);
  const from = dateKey(range[0]), to = dateKey(range.at(-1));
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ tasks: [], days: [], loading: true, error: null });
  usePendingChanges();
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
  // 실행 취소를 기다리는 삭제는 먼저 지운 것처럼 보여 준다
  const tasks = state.tasks.filter(task => !isPending(`task:${task.id}`));
  const taskById = id => tasks.find(task => task.id === id) ?? null;
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
  // grouped: true면 같은 상위 작업의 이어지는 하위작업을 하나로 묶어 상위 작업 이름으로 보여 준다(캘린더).
  // false면 하위작업 블록을 그대로 둔다(홈의 오늘 할 일).
  // released: 시작 전에 미리 완료해 시간을 비운 기록. 캘린더에는 없고 오늘 할 일에만 완료로 남긴다(includeReleased).
  const blocksForDate = (date, { grouped = true, includeReleased = false } = {}) => {
    const items = (state.days.find(day => day.date === dateKey(date))?.items ?? [])
      .filter(block => (includeReleased || !block.released) && !(block.taskId && isPending(`task:${block.taskId}`)))
      .sort((a, b) => a.start.localeCompare(b.start));
    return (grouped ? groupByTask(items) : items).map(block => ({
      ...block, date: dateKey(date), fixedKind: block.kind, kind: block.source === 'scheduled' ? 'task' : block.source === 'rest' ? 'break' : block.kind === 'routine' ? 'routine' : block.kind === 'event' ? 'daily' : 'fixed',
      task: taskById(block.taskId), note: block.status === 'missed' ? '미수행' : block.source === 'scheduled' ? '자동 배치' : undefined,
      ...(grouped && block.source === 'scheduled' && taskById(block.taskId) ? { title: taskById(block.taskId).title } : {}),
      // 묶음은 모두 끝났을 때만 완료다. 아니면 아직 안 끝난 첫 블록의 상태를 쓴다
      ...(grouped && block.parts.length > 1 ? { status: block.parts.every(part => part.status === 'done') ? 'done' : block.parts.find(part => part.status !== 'done').status,
        released: block.parts.every(part => part.released) } : {}),
    }));
  };
  return { ...state, tasks, taskById, blocksForDate };
}
