// LLM 공통 인터페이스.
// 제공자(OpenAI / Anthropic / Gemini ...)는 아직 미정이므로 이 파일 안에서만 교체한다.
// 원칙: LLM은 "이해·추정"만 한다. 시간 배치는 scheduler/ 의 규칙 기반 로직이 담당.
// API 키는 반드시 백엔드 .env(LLM_API_KEY)에서만 읽는다.

/**
 * 제공자에 상관없이 쓰는 저수준 호출 함수.
 * @param {{ system?: string, messages: {role: 'user'|'assistant', content: string}[], json?: boolean }} params
 * @returns {Promise<string>} 모델 응답 텍스트
 */
export async function complete({ system, messages, json = false }) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY is not set');
  // TODO: 제공자 확정 후 SDK/fetch 호출 구현
  throw new Error('LLM provider not configured');
}

/**
 * 사용자 발화를 구조화된 의도로 해석한다.
 * @param {string} text 음성 인식 결과
 * @param {object} context 오늘 날짜, 기존 작업 목록 등
 * @returns {Promise<{ intent: 'add_task'|'report_progress'|'query_schedule'|'reschedule'|'smalltalk', slots: object, reply: string }>}
 */
export async function interpretUtterance(text, context = {}) {
  // TODO: prompts/interpret.js 프롬프트 + complete({ json: true })
  throw new Error('Not implemented');
}

/**
 * 작업을 하위작업으로 나누고 기본 소요시간(분)을 추정한다.
 * 개인 보정은 scheduler/estimator.js에서 따로 적용한다.
 * @param {{ title: string, type: string, deadline?: string }} task
 * @returns {Promise<{ subtasks: { title: string, estimatedMinutes: number }[], estimatedMinutes: number }>}
 */
export async function breakdownTask(task) {
  // TODO: prompts/breakdown.js 프롬프트 + complete({ json: true })
  throw new Error('Not implemented');
}
