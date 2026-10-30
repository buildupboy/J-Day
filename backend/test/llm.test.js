import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmClient } from '../src/services/llm.js';

const env = { OPENAI_API_KEY: 'test-only-key', OPENAI_MODEL: 'test-only-model' };
const response = content => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) });
test('공식 Chat Completions + strict JSON schema 요청; 인증은 서버에만', async () => {
  const client = createLlmClient({ env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.model, 'test-only-model');
    assert.equal(body.messages[0].role, 'system');
    return response('{"intent":"clarify"}');
  } });
  assert.deepEqual(await client.interpretUtterance('과제 있어', { today: '2026-10-30' }), { intent: 'clarify' });
});
test('설정 누락은 503, 실제 외부 호출 없음', async () => {
  const client = createLlmClient({ env: {}, fetchImpl: () => assert.fail('must not call') });
  await assert.rejects(client.interpretUtterance('test'), { status: 503 });
});
test('API 오류/잘린 응답/잘못된 JSON/거절은 안전한 실패', async () => {
  for (const mock of [ { ok: false, status: 500, json: async () => ({ error: { message: 'sensitive upstream message' } }) }, response('not JSON'),
    { ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) },
    { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { refusal: 'no', content: '{}' } }] }) } ]) {
    const client = createLlmClient({ env, fetchImpl: async () => mock });
    await assert.rejects(client.interpretUtterance('test'), error => error.status === 502 && !error.message.includes('test-only-key'));
  }
});
test('인증·권한·모델·잔액 오류를 구분하며 제공자 원문과 키를 노출하지 않음', async () => {
  for (const [status, code, expected] of [
    [401, 'invalid_api_key', '키 인증에 실패'], [403, null, '접근 권한'],
    [404, 'model_not_found', '모델에 접근'], [429, 'insufficient_quota', '잔액 또는 결제'],
  ]) {
    const client = createLlmClient({ env, fetchImpl: async () => ({ ok: false, status,
      json: async () => ({ error: { code, message: 'sensitive upstream message test-only-key' } }),
    }) });
    await assert.rejects(client.interpretUtterance('test'), error => error.status === 503
      && error.message.includes(expected) && !error.message.includes('test-only-key')
      && !error.message.includes('sensitive upstream message'));
  }
});
test('API 사용 한도는 503, 네트워크 timeout은 504', async () => {
  await assert.rejects(createLlmClient({ env, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 'rate_limit_exceeded' } }) }) }).interpretUtterance('test'), { status: 503 });
  await assert.rejects(createLlmClient({ env, fetchImpl: async () => { throw Object.assign(new Error(), { name: 'TimeoutError' }); } }).interpretUtterance('test'), { status: 504 });
});
