import { useEffect, useRef } from 'react';
import RepeatEventPage from '../../pages/RepeatEventPage.jsx';

export default function RoutineEditDialog({ routine, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="my-dialog routine-edit-dialog" aria-label={routine.kind === 'routine' ? '루틴 수정' : '고정 일정 수정'}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <RepeatEventPage editingBlock={routine} onClose={onClose} />
  </dialog>;
}
