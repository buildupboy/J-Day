import { MAX_TASK_STEPS } from './task-granularity.js';
const nullable = type => ({ type: [type, 'null'] });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const TASK_TYPES = ['report', 'coding', 'exam', 'presentation', 'reading', 'etc'];
// 한 발화에 작업이 여러 개일 때 두 번째부터의 작업. 첫 작업은 slots에 담는다.
export const MAX_UTTERANCE_TASKS = 10;
const EXTRA_TASK = object({
  title: nullable('string'), type: { type: ['string', 'null'], enum: [...TASK_TYPES, null] },
  deadline: nullable('string'), baseEstimatedMinutes: nullable('integer'), importance: nullable('integer'),
  estimateByAi: { type: 'boolean' }, distinctFromExisting: { type: 'boolean' },
});
export const INTERPRET_SCHEMA = object({
  intent: { type: 'string', enum: ['add_task', 'update_task', 'report_progress', 'query_schedule', 'reschedule', 'clarify', 'unsupported'] },
  slots: object({
    title: nullable('string'), type: { type: ['string', 'null'], enum: [...TASK_TYPES, null] },
    deadline: nullable('string'), baseEstimatedMinutes: nullable('integer'), importance: nullable('integer'),
    estimateByAi: { type: 'boolean' }, distinctFromExisting: { type: 'boolean' },
    taskId: nullable('string'), progress: nullable('number'), actualMinutes: nullable('integer'),
    actualMinutesMode: { type: ['string', 'null'], enum: ['cumulative', 'increment', null] }, date: nullable('string'),
    unavailableDates: { type: ['array', 'null'], items: { type: 'string' } },
    availabilityAction: { type: ['string', 'null'], enum: ['block', 'unblock', null] },
  }),
  extraTasks: { type: 'array', items: EXTRA_TASK },
  reply: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } },
});
export const BREAKDOWN_SCHEMA = object({
  subtasks: { type: 'array', minItems: 1, maxItems: MAX_TASK_STEPS, items: object({ title: { type: 'string' }, estimatedMinutes: { type: 'integer' } }) },
  baseEstimatedMinutes: { type: 'integer' }, rangeMinutes: { type: 'array', items: { type: 'integer' } },
  assumptions: { type: 'array', items: { type: 'string' } },
});
