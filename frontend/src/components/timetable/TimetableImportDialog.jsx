import { useEffect, useRef } from 'react';
import FixedSchedulePage from '../../pages/FixedSchedulePage.jsx';

export default function TimetableImportDialog({ onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="my-dialog timetable-import-dialog" aria-label="사진으로 시간표 추가"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="my-dialog-heading"><h2>시간표 가져오기</h2><button type="button" aria-label="닫기" onClick={onClose}>×</button></div>
    <FixedSchedulePage inlineImport onBack={onClose} />
  </dialog>;
}
