// 백엔드 연결 전까지 쓰는 캘린더 임시 데이터.
// kind: fixed(수업·알바 등 고정) / routine(루틴) / task(AI가 배치한 작업) / event(새로 추가된 일정) / break(점심·휴식)
// task 블록은 taskId(상위 작업)와 subtaskId(이 블록에서 할 하위 작업)로 TASKS와 연결된다.
const SAMPLE = [
  { id: 'b0', kind: 'routine', title: '아침 운동', start: '07:00', end: '07:40' },
  { id: 'b1', kind: 'break', title: '점심', start: '12:00', end: '12:45' },
  { id: 'b2', kind: 'task', title: '보고서 자료 조사', start: '12:45', end: '13:45', note: '공강 · 60분', taskId: 't-report', subtaskId: 'st-1' },
  { id: 'b3', kind: 'fixed', title: '캡스톤디자인', start: '14:00', end: '15:15', note: '수업', location: '공학관 410' },
  { id: 'b4', kind: 'task', title: 'OS 과제 3', start: '15:30', end: '16:30', note: '60분', taskId: 't-os', subtaskId: 'st-5' },
  { id: 'b5', kind: 'break', title: '휴식', start: '16:30', end: '16:45' },
  { id: 'b6', kind: 'task', title: '발표 PPT 구성', start: '16:45', end: '17:40', note: '55분', taskId: 't-ppt', subtaskId: 'st-8' },
  { id: 'b7', kind: 'event', title: '팀플 회의', start: '18:00', end: '19:30', note: '새로 추가됨', location: '중앙도서관 스터디룸' },
  { id: 'b8', kind: 'task', title: '보고서 본문 작성', start: '20:30', end: '21:45', note: '75분', taskId: 't-report', subtaskId: 'st-2' },
];

// priority: must(필수) / important(중요) / optional(선택)
const TASKS = {
  't-report': {
    id: 't-report',
    title: '캡스톤 보고서',
    deadline: '2026-12-03',
    priority: 'must',
    estimatedMinutes: 660,
    subtasks: [
      { id: 'st-1', title: '자료 조사', estimatedMinutes: 180, done: false },
      { id: 'st-2', title: '본문 작성', estimatedMinutes: 360, done: false },
      { id: 'st-3', title: '검토 · 제출', estimatedMinutes: 120, done: false },
    ],
  },
  't-os': {
    id: 't-os',
    title: 'OS 과제 3',
    deadline: '2026-11-06',
    priority: 'must',
    estimatedMinutes: 240,
    subtasks: [
      { id: 'st-4', title: 'FCFS · SJF 구현', estimatedMinutes: 120, done: true },
      { id: 'st-5', title: 'RR 구현 및 테스트', estimatedMinutes: 120, done: false },
    ],
  },
  't-ppt': {
    id: 't-ppt',
    title: '발표 PPT',
    deadline: '2026-11-12',
    priority: 'important',
    estimatedMinutes: 180,
    subtasks: [
      { id: 'st-7', title: '자료 수집', estimatedMinutes: 60, done: true },
      { id: 'st-8', title: '슬라이드 구성', estimatedMinutes: 90, done: false },
      { id: 'st-9', title: '발표 연습', estimatedMinutes: 30, done: false },
    ],
  },
};

export function getTaskById(id) {
  return TASKS[id] ?? null;
}

/** 날짜별 블록 조회. 지금은 모든 날에 같은 예시를 돌려준다. */
export function getBlocksForDate(date) {
  const dow = (date.getDay() + 6) % 7;
  return dow >= 5 ? SAMPLE.filter((b) => b.kind === 'task').slice(0, dow - 4) : SAMPLE;
}
