import { createHash } from 'node:crypto';
import { complete } from './llm.js';
import { ESTIMATE_SCHEMA, ESTIMATE_SYSTEM_PROMPT } from '../prompts/estimate.js';
import { assertSchema, fail, validText, integer } from './voice-validation.js';

export function createTaskEstimator({ completeFn = complete, clock = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  return async function estimateTask(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('과제 내용을 입력해 주세요.');
    const title = body.title ? validText(body.title, 'title', 300) : '';
    const description = body.description ? validText(body.description, 'description', 12000) : '';
    if (!Array.isArray(body.files ?? []) || (body.files ?? []).length > 3) fail('첨부는 최대 3개입니다.');
    const files = (body.files ?? []).map(file => ({ name: validText(file?.name, '파일명', 200), text: validText(file?.text, '첨부 내용', 12000) }));
    if (!title && !description && !files.length) fail('제목, 과제 내용 또는 첨부가 필요해요.');
    if (description.length + files.reduce((sum,file) => sum + file.text.length,0) > 16000) fail('설명과 첨부 내용은 총 16000자 이하로 줄여 주세요.');
    const input = { title, description, files };
    const key = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const saved = cache.get(key);
    if (saved && saved.expires > clock()) return structuredClone(saved.value);
    if (pending.has(key)) return structuredClone(await pending.get(key));
    if (pending.size >= 4) fail('다른 예상 시간을 계산 중이에요. 잠시 후 다시 눌러 주세요.', 429);
    const promise = (async () => {
      const raw = await completeFn({ system: ESTIMATE_SYSTEM_PROMPT, schema: ESTIMATE_SCHEMA, name:'task_estimate', messages:[{role:'user',content:JSON.stringify(input)}] });
      let result; try { result = JSON.parse(raw); } catch { fail('AI 추정 결과를 읽지 못했어요. 다시 시도해 주세요.',502); }
      assertSchema(result,ESTIMATE_SCHEMA);
      integer(result.baseEstimatedMinutes,'예상 시간',1);
      if (!result.subtasks.length || result.subtasks.length > 10) fail('AI 작업 분할은 1~10개여야 합니다.',502);
      result.subtasks.forEach(item => { item.title=validText(item.title,'하위작업',120); integer(item.estimatedMinutes,'하위작업 시간',1); });
      if (result.subtasks.reduce((sum,item)=>sum+item.estimatedMinutes,0)!==result.baseEstimatedMinutes) fail('AI 추정시간 합계가 일치하지 않아요. 다시 시도해 주세요.',502);
      if (result.rangeMinutes.length!==2 || !result.rangeMinutes.every(n=>Number.isSafeInteger(n)&&n>0&&n<=1000000) || result.rangeMinutes[0]>result.baseEstimatedMinutes || result.rangeMinutes[1]<result.baseEstimatedMinutes) fail('AI 추정 범위가 올바르지 않아요.',502);
      const value={...result,source:'ai'};
      for (const [id,item] of cache) if(item.expires<=clock()) cache.delete(id);
      if(cache.size>=32)cache.delete(cache.keys().next().value);
      cache.set(key,{value:structuredClone(value),expires:clock()+5*60000});
      return value;
    })().catch(error => { if(error.status === 400) error.status = 502; throw error; });
    pending.set(key,promise);
    try{return structuredClone(await promise);}finally{pending.delete(key);}
  };
}
