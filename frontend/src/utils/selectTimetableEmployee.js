// 여러 직원의 근무를 한 사람의 고정 시간표로 합치지 않는다.
export function selectTimetableEmployee(draft, selectedName) {
  const employees = [...new Set((draft.lessons ?? []).map((item) => item.employeeName).filter(Boolean))];
  if (!employees.length) return draft;
  const selected = selectedName ?? (employees.length === 1 ? employees[0] : null);
  if (!selected) return null;
  if (!employees.includes(selected)) throw new Error('표에 있는 직원을 선택해 주세요.');
  const lessons = draft.lessons.filter((item) => item.employeeName === selected);
  return { ...draft, lessons, selectedEmployee: selected };
}
