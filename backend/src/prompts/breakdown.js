// 작업 분해·시간 추정용 시스템 프롬프트 (services/llm.breakdownTask 에서 사용)
// TODO: 과제 유형별 기준, 출력 JSON 스키마 작성
export const BREAKDOWN_SYSTEM_PROMPT = `너는 대학생 과제를 하위작업으로 나누고 각 소요시간(분)을 추정한다.
JSON으로만 출력한다.`;
