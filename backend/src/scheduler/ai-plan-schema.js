/** LLM 담당자가 구조화된 배치 결과 생성에 사용할 수 있는 JSON Schema. */
export const AI_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['contextId', 'blocks'],
  properties: {
    contextId: { type: 'string' },
    blocks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['taskId', 'subtaskId', 'date', 'start', 'end', 'placementReason'],
        properties: {
          taskId: { type: 'string' }, subtaskId: { type: ['string', 'null'] },
          date: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
          placementReason: { type: 'string' },
        },
      },
    },
  },
};
