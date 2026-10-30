import { MAX_TASK_STEPS } from './task-granularity.js';
const nullable = type => ({ type: [type, 'null'] });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const TASK_TYPES = ['report', 'coding', 'exam', 'presentation', 'reading', 'etc'];
export const INTERPRET_SCHEMA = object({
  intent: { type: 'string', enum: ['add_task', 'update_task', 'report_progress', 'query_schedule', 'reschedule', 'clarify', 'unsupported'] },
  slots: object({
    title: nullable('string'), type: { type: ['string', 'null'], enum: [...TASK_TYPES, null] },
    deadline: nullable('string'), baseEstimatedMinutes: nullable('integer'), importance: nullable('integer'),
    taskId: nullable('string'), progress: nullable('number'), actualMinutes: nullable('integer'),
    actualMinutesMode: { type: ['string', 'null'], enum: ['cumulative', 'increment', null] }, date: nullable('string'),
  }),
  reply: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } },
});
export const BREAKDOWN_SCHEMA = object({
  subtasks: { type: 'array', minItems: 1, maxItems: MAX_TASK_STEPS, items: object({ title: { type: 'string' }, estimatedMinutes: { type: 'integer' } }) },
  baseEstimatedMinutes: { type: 'integer' }, rangeMinutes: { type: 'array', items: { type: 'integer' } },
  assumptions: { type: 'array', items: { type: 'string' } },
});
