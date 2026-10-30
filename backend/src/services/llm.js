import { INTERPRET_SYSTEM_PROMPT } from '../prompts/interpret.js';
import { BREAKDOWN_SYSTEM_PROMPT } from '../prompts/breakdown.js';
import { INTERPRET_SCHEMA, BREAKDOWN_SCHEMA } from '../prompts/schemas.js';

const failure = (message, status = 502) => Object.assign(new Error(message), { status });

export function createLlmClient({ fetchImpl = globalThis.fetch, env = process.env, timeoutSignal = AbortSignal.timeout, onTelemetry = event => console.info('[ai]', JSON.stringify(event)) } = {}) {
  async function complete({ system, messages, schema, name = 'response', json = false }) {
    const apiKey = env.OPENAI_API_KEY || env.LLM_API_KEY;
    const model = env.OPENAI_MODEL || env.LLM_MODEL;
    if (!apiKey || !model) throw failure('백엔드 .env에 OPENAI_API_KEY와 OPENAI_MODEL을 설정해 주세요.', 503);
    const planning = name === 'schedule_plan';
    const timeout = Number(planning ? env.LLM_PLANNING_TIMEOUT_MS || 120000 : env.LLM_TIMEOUT_MS || 60000);
    const timeoutSetting = planning ? 'LLM_PLANNING_TIMEOUT_MS' : 'LLM_TIMEOUT_MS';
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) throw failure(`${timeoutSetting}는 100~120000이어야 합니다.`, 503);
    const started = Date.now();
    onTelemetry({ stage: name, event: 'started', timeoutMs: timeout });
    const timeoutError = () => Object.assign(failure(`${planning ? '전체 일정을 배치하는' : '요청을 해석하는'} AI 응답이 제한시간(${timeout / 1000}초)을 넘겼어요. 다시 시도를 눌러 주세요.`, 504), { stage: name });
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: timeoutSignal(timeout),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages],
          ...(schema ? { response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } }
            : json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch (err) {
      onTelemetry({ stage: name, event: 'failed', elapsedMs: Date.now() - started, timeout: ['TimeoutError', 'AbortError'].includes(err.name) });
      if (['TimeoutError', 'AbortError'].includes(err.name)) throw timeoutError();
      throw failure('AI 서비스에 연결하지 못했어요.');
    }
    onTelemetry({ stage: name, event: 'received', elapsedMs: Date.now() - started, status: response.status ?? 200 });
    // 원문 메시지는 API 키 일부 등을 포함할 수 있다. 상태·알려진 코드만 해석한다.
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const code = errorBody?.error?.code;
      if (response.status === 401) throw failure('OpenAI API 키 인증에 실패했어요. backend/.env의 OPENAI_API_KEY를 확인한 뒤 백엔드를 재시작해 주세요.', 503);
      if (response.status === 403) throw failure('OpenAI API 접근 권한이 없어요. 키의 프로젝트·모델 사용 권한을 확인해 주세요.', 503);
      if (response.status === 404) throw failure('설정한 AI 모델에 접근할 수 없어요. OPENAI_MODEL과 프로젝트의 모델 사용 권한을 확인해 주세요.', 503);
      if (response.status === 429) throw failure(code === 'insufficient_quota'
        ? 'OpenAI API 사용 잔액 또는 결제 한도를 확인해 주세요.'
        : 'AI 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.', 503);
      if (response.status === 400) throw failure('AI 요청 형식이 거부됐어요. 설정한 모델의 Chat Completions·JSON Schema 지원 여부를 확인해 주세요.', 502);
      throw failure('AI 서비스 요청이 실패했어요. 잠시 후 다시 시도해 주세요.', 502);
    }
    let data;
    try { data = await response.json(); } catch (error) {
      if (['TimeoutError', 'AbortError'].includes(error.name)) throw timeoutError();
      throw failure('AI 응답을 읽을 수 없어요.');
    }
    const choice = data.choices?.[0];
    if (!choice || choice.finish_reason !== 'stop' || choice.message?.refusal || typeof choice.message?.content !== 'string') throw failure('AI가 완전한 작업 정보를 반환하지 못했어요.');
    onTelemetry({ stage: name, event: 'completed', elapsedMs: Date.now() - started });
    return choice.message.content;
  }
  async function structured(system, schema, name, messages) {
    const content = await complete({ system, schema, name, messages });
    try { return JSON.parse(content); } catch { throw failure('AI가 올바른 JSON을 반환하지 못했어요.'); }
  }
  async function interpretUtterance(text, context = {}, conversation = []) {
    return structured(INTERPRET_SYSTEM_PROMPT, INTERPRET_SCHEMA, 'voice_intent', [
      ...conversation, { role: 'user', content: JSON.stringify({ context, utterance: text }) },
    ]);
  }
  async function breakdownTask(task) {
    return structured(BREAKDOWN_SYSTEM_PROMPT, BREAKDOWN_SCHEMA, 'task_breakdown', [
      { role: 'user', content: JSON.stringify(task) },
    ]);
  }
  return { complete, interpretUtterance, breakdownTask };
}
export const { complete, interpretUtterance, breakdownTask } = createLlmClient();
