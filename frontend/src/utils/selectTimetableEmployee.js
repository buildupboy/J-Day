// 여러 직원의 근무를 한 사람의 고정 시간표로 합치지 않는다.
export function selectTimetableEmployee(draft, { prompt = window.prompt.bind(window), storage = window.localStorage } = {}) {
  const employees = [...new Set((draft.lessons ?? []).map((item) => item.employeeName).filter(Boolean))];
  if (!employees.length) return draft;
  let selected = employees[0];
  if (employees.length > 1) {
    let remembered = '';
    try { remembered = storage.getItem('jday-timetable-employee') ?? ''; } catch { /* 저장 불가 시에도 선택 가능 */ }
    const answer = prompt(`누구의 근무를 등록할까요? 이름 또는 번호를 입력해 주세요.\n${employees.map((name, index) => `${index + 1}. ${name}`).join('\n')}`, employees.includes(remembered) ? remembered : '');
    if (answer === null) return null;
    const value = answer.trim();
    selected = employees.includes(value) ? value : /^\d+$/.test(value) ? employees[Number(value) - 1] : null;
    if (!selected) throw new Error('표에 있는 직원의 이름 또는 번호를 입력해 주세요. 일정은 저장하지 않았어요.');
  }
  try { storage.setItem('jday-timetable-employee', selected); } catch { /* 선택 결과는 그대로 사용 */ }
  const lessons = draft.lessons.filter((item) => item.employeeName === selected);
  return { ...draft, lessons, selectedEmployee: selected };
}
