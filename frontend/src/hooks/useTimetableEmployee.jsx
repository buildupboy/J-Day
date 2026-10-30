import { useEffect, useId, useRef, useState } from 'react';
import { selectTimetableEmployee } from '../utils/selectTimetableEmployee.js';

function EmployeeDialog({ draft, onSelect }) {
  const dialog = useRef(null);
  const titleId = useId();
  const employees = [...new Set(draft.lessons.map((item) => item.employeeName).filter(Boolean))];
  let remembered = '';
  try { remembered = localStorage.getItem('jday-timetable-employee') ?? ''; } catch { /* 선택은 계속 가능 */ }
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="my-dialog employee-dialog" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onSelect(null); }}
    onClick={(event) => { if (event.target === dialog.current) onSelect(null); }}>
    <div className="my-dialog-heading"><h2 id={titleId}>누구의 근무를 가져올까요?</h2><button type="button" aria-label="닫기" onClick={() => onSelect(null)}>×</button></div>
    <p className="my-dialog-description">이름을 누르면 해당 직원의 근무만 가져와요.</p>
    <div className="employee-options">
      {employees.map((name, index) => <button key={name} type="button" autoFocus={name === remembered || (!employees.includes(remembered) && index === 0)} onClick={() => onSelect(name)}>
        <strong>{name}</strong><span>{name === remembered ? '이전에 선택함 · ' : ''}{draft.lessons.filter((item) => item.employeeName === name).length}개 일정</span>
      </button>)}
    </div>
    <button type="button" className="d-btn d-btn-line employee-cancel" onClick={() => onSelect(null)}>취소</button>
  </dialog>;
}

export default function useTimetableEmployee() {
  const [pending, setPending] = useState(null);
  const resolveSelection = useRef(null);
  useEffect(() => () => { resolveSelection.current?.(null); resolveSelection.current = null; }, []);
  const chooseEmployee = async (draft) => {
    const employees = [...new Set((draft.lessons ?? []).map((item) => item.employeeName).filter(Boolean))];
    if (employees.length <= 1) return selectTimetableEmployee(draft);
    return new Promise((resolve) => { resolveSelection.current = resolve; setPending(draft); });
  };
  const finish = (name) => {
    const result = name ? selectTimetableEmployee(pending, name) : null;
    if (name) { try { localStorage.setItem('jday-timetable-employee', name); } catch { /* 저장 실패해도 진행 */ } }
    resolveSelection.current?.(result);
    resolveSelection.current = null;
    setPending(null);
  };
  return { chooseEmployee, employeeDialog: pending ? <EmployeeDialog draft={pending} onSelect={finish} /> : null };
}
