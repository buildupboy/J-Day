// 백엔드 연결 전까지 쓰는 캘린더 임시 데이터.
// kind: fixed(수업·알바 등 고정) / routine(루틴) / task(AI가 배치한 작업) / event(새로 추가된 일정) / break(점심·휴식)
const SAMPLE = [
  { id: 'b0', kind: 'routine', title: '아침 운동', start: '07:00', end: '07:40' },
  { id: 'b1', kind: 'break', title: '점심', start: '12:00', end: '12:45' },
  { id: 'b2', kind: 'task', title: '보고서 자료 조사', start: '12:45', end: '13:45', note: '공강 · 60분' },
  { id: 'b3', kind: 'fixed', title: '캡스톤디자인', start: '14:00', end: '15:15', note: '수업' },
  { id: 'b4', kind: 'task', title: 'OS 과제 3', start: '15:30', end: '16:30', note: '60분' },
  { id: 'b5', kind: 'break', title: '휴식', start: '16:30', end: '16:45' },
  { id: 'b6', kind: 'task', title: '발표 PPT 구성', start: '16:45', end: '17:40', note: '55분' },
  { id: 'b7', kind: 'event', title: '팀플 회의', start: '18:00', end: '19:30', note: '새로 추가됨' },
  { id: 'b8', kind: 'task', title: '보고서 본문 작성', start: '20:30', end: '21:45', note: '75분' },
];

/** 날짜별 블록 조회. 지금은 모든 날에 같은 예시를 돌려준다. */
export function getBlocksForDate(date) {
  const dow = (date.getDay() + 6) % 7;
  return dow >= 5 ? SAMPLE.filter((b) => b.kind === 'task').slice(0, dow - 4) : SAMPLE;
}
