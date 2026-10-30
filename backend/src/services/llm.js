import { INTERPRET_SYSTEM_PROMPT } from '../prompts/interpret.js';
import { BREAKDOWN_SYSTEM_PROMPT } from '../prompts/breakdown.js';
import { INTERPRET_SCHEMA, BREAKDOWN_SCHEMA } from '../prompts/schemas.js';

const failure = (message, status = 502) => Object.assign(new Error(message), { status });

export function createLlmClient({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  async function complete({ system, messages, schema, name = 'response', json = false }) {
    const apiKey = env.OPENAI_API_KEY || env.LLM_API_KEY;
    const model = env.OPENAI_MODEL || env.LLM_MODEL;
    if (!apiKey || !model) throw failure('백엔드 .env에 OPENAI_API_KEY와 OPENAI_MODEL을 설정해 주세요.', 503);
    const timeout = Number(env.LLM_TIMEOUT_MS || 30000);
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) throw failure('LLM_TIMEOUT_MS는 100~120000이어야 합니다.', 503);
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeout),
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages],
          ...(schema ? { response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } }
            : json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch (err) {
      if (['TimeoutError', 'AbortError'].includes(err.name)) throw failure('AI 응답 시간이 초과됐어요. 같은 requestId로 다시 시도해 주세요.', 504);
      throw failure('AI 서비스에 연결하지 못했어요.');
    }
    // 제공자 원문 오류에는 민감한 정보가 있을 수 있으므로 전달하지 않는다.
    if (!response.ok) throw failure(response.status === 429 ? 'AI 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.' : 'AI 요청이 실패했어요. 모델과 키 설정을 확인해 주세요.', response.status === 429 ? 503 : 502);
    let data;
    try { data = await response.json(); } catch { throw failure('AI 응답을 읽을 수 없어요.'); }
    const choice = data.choices?.[0];
    if (!choice || choice.finish_reason !== 'stop' || choice.message?.refusal || typeof choice.message?.content !== 'string') throw failure('AI가 완전한 작업 정보를 반환하지 못했어요.');
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
