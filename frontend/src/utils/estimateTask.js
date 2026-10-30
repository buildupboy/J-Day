// 작업 이름으로 유형을 추정해 예상 소요 시간과 하위 작업 분해를 만든다.
// 개인 보정 계수(coef)는 분석 화면의 "내 작업 속도"와 같은 값을 쓴다.
// TODO: 백엔드 scheduler/estimator + LLM(breakdownTask)이 구현되면 그 결과로 대체한다.

const TYPES = [
  {
    key: 'report',
    match: /보고서|레포트|리포트|논문|에세이/,
    label: '보고서',
    coef: 1.3,
    items: [['자료 조사', 2.5], ['본문 작성', 4.5], ['검토 · 제출', 1.5]],
  },
  {
    key: 'coding',
    match: /코딩|구현|프로그래밍|개발|알고리즘|프로젝트|실습/,
    label: '코딩 과제',
    coef: 1.1,
    items: [['설계', 1], ['구현', 3.5], ['테스트', 1.5]],
  },
  {
    key: 'presentation',
    match: /발표|ppt|피티|프레젠/i,
    label: '발표 준비',
    coef: 0.9,
    items: [['자료 조사', 2], ['슬라이드 제작', 3], ['발표 연습', 1]],
  },
  {
    key: 'exam',
    match: /시험|중간|기말|퀴즈/,
    label: '시험 공부',
    coef: 1,
    items: [['개념 학습', 4], ['문제 풀이', 3], ['복습', 2]],
  },
];

const DEFAULT_TYPE = {
  key: 'etc',
  label: '작업',
  coef: 1,
  items: [['자료 조사', 1.5], ['작업', 3], ['검토', 1]],
};

/**
 * @param {string} title 작업 이름
 * @returns {{ type: string, label: string, coef: number, items: {title: string, hours: number}[],
 *             totalHours: number, minHours: number, maxHours: number, subtasks: object[] }}
 */
export function estimateTask(title) {
  const type = TYPES.find((t) => t.match.test(title)) ?? DEFAULT_TYPE;
  const items = type.items.map(([name, base]) => ({
    title: name,
    hours: Math.max(1, Math.round(base * type.coef)),
  }));
  const totalHours = items.reduce((sum, it) => sum + it.hours, 0);

  return {
    type: type.key,
    label: type.label,
    coef: type.coef,
    items,
    totalHours,
    minHours: totalHours,
    maxHours: Math.round(totalHours * 1.35), // 불확실성을 범위로 보여 준다
    subtasks: items.map((it) => ({ title: it.title, estimatedMinutes: it.hours * 60 })),
  };
}
