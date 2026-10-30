import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { addDays } from '../../utils/calendar.js';
import { toIsoDate } from '../../utils/parseTaskText.js';
import BlockDetailSheet from '../calendar/BlockDetailSheet.jsx';
import SheetHandle from '../common/SheetHandle.jsx';

// 작업 하나의 상세. 캘린더와 같은 상세 시트를 쓰도록 다음에 할 배치 블록을 찾아 연다 (일정 탭·홈 가장 빠른 마감).
export default function TaskDetail({ task, details, onClose }) {
  const [state, setState] = useState({ loading: true, block: null, error: '' });
  useEffect(() => {
    let active = true;
    async function load() {
      const today = toIsoDate(new Date());
      try {
        for (let from = new Date(`${today}T00:00:00`); toIsoDate(from) <= task.deadline.slice(0, 10); from = addDays(from, 7)) {
          const week = await api.getWeekSchedule(toIsoDate(from));
          if (!active) return;
          const matches = week.days.flatMap((day) => day.items
            .filter((item) => item.source === 'scheduled' && item.taskId === task.id)
            .map((item) => ({ ...item, date: day.date, kind: 'task', task }))
          ).sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
          const block = matches.find((item) => item.status !== 'done' && item.status !== 'missed') ?? matches[0];
          if (block) {
            setState({ loading: false, block, error: '' });
            return;
          }
        }
        if (active) setState({ loading: false, block: { id: task.id, taskId: task.id, title: task.title, kind: 'task', task }, error: '' });
      } catch (error) {
        if (active) setState({ loading: false, block: null, error: error.message });
      }
    }
    load();
    return () => { active = false; };
  }, [task]);
  // 시트를 연 채로 하위 작업을 추가·완료하면 최신 작업 정보로 다시 그린다
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = () => api.getTasks().then((tasks) => active && setLatest(tasks.find((item) => item.id === task.id) ?? null)).catch(() => {});
    window.addEventListener('schedule-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('schedule-changed', refresh);
    };
  }, [task]);
  if (state.block) return <BlockDetailSheet block={latest ? { ...state.block, task: latest } : state.block} details={details} onClose={onClose} />;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet sheet-auto" role="dialog" aria-modal="true" aria-label={`${task.title} 상세`} onClick={(event) => event.stopPropagation()}>
        <SheetHandle onClose={onClose} />
        <div className="sheet-head"><h2>{task.title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="닫기">✕</button></div>
        {state.loading ? <p role="status">작업 일정을 불러오는 중이에요…</p> : <p role="alert">일정을 불러오지 못했어요. ({state.error})</p>}
      </section>
    </div>
  );
}
