// 수동 입력 시의 분류만 담당한다. 소요시간 추천은 서버 AI가 계산한다.
export function inferTaskType(title) {
  for (const [type, pattern] of [
    ['report', /보고서|레포트|리포트|논문|에세이/],
    ['coding', /코딩|구현|프로그래밍|개발|알고리즘|프로젝트|실습/],
    ['presentation', /발표|ppt|피티|프레젠/i],
    ['exam', /시험|중간|기말|퀴즈/],
    ['reading', /독서|읽기/],
  ]) if (pattern.test(title)) return type;
  return 'etc';
}
