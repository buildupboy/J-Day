import { useEffect, useRef } from 'react';
import TasksPage from '../../pages/TasksPage.jsx';
import NewEventPage from '../../pages/NewEventPage.jsx';
import RepeatEventPage from '../../pages/RepeatEventPage.jsx';

// Use the same forms as addition while keeping the calendar selection underneath.
export default function CalendarEditDialog({ block, task, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const original = { ...block, kind: block.fixedKind ?? block.kind, date: block.fixedDate };
  return (
    <dialog ref={dialog} className="calendar-edit-dialog" aria-label={task ? '작업 수정' : '일정 수정'}
      onCancel={event => { event.preventDefault(); onClose(); }}>
      {task ? <TasksPage editingTask={task} onClose={onClose} />
        : original.kind === 'event' && original.date
          ? <NewEventPage editingBlock={original} onClose={onClose} />
          : <RepeatEventPage editingBlock={original} onClose={onClose} />}
    </dialog>
  );
}
