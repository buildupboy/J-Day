import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLessons, validateImage, extractTimetable } from './timetable.js';
const lesson = { title: 'Database', dayOfWeek: [1, 3], start: '09:00', end: '10:30', location: '205' };
const image = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10]).toString('base64');
test('normalize repeated classes and reject invalid days and time ranges', () => {
  const [saved] = validateLessons([{ ...lesson, dayOfWeek: [1, 1, 3], unexpected: 'discard' }]);
  assert.deepEqual(saved.dayOfWeek, [1, 3]);
  assert.equal(saved.kind, 'class'); assert.equal(saved.unexpected, undefined);
  for (const patch of [{ dayOfWeek: [] }, { dayOfWeek: [7] }, { end: '08:00' }, { start: '25:00' }, { title: '' }]) assert.throws(() => validateLessons([{ ...lesson, ...patch }]));
  assert.deepEqual(validateLessons([]), []);
});
test('image type, signature, and size validation', () => {
  assert.equal(validateImage(image), image);
  assert.throws(() => validateImage('https://example.com/photo.png'));
  assert.throws(() => validateImage('data:image/png;base64,aGVsbG8='));
  assert.throws(() => validateImage('data:image/png;base64,' + Buffer.alloc(6 * 1024 * 1024).toString('base64')));
});
test('extract handles configuration, provider failure, and validates provider JSON', async () => {
  const oldKey = process.env.OPENAI_API_KEY, oldModel = process.env.OPENAI_MODEL, oldVision = process.env.OPENAI_VISION_MODEL;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(extractTimetable(image), { status: 503 });
    process.env.OPENAI_API_KEY = 'test-only'; process.env.OPENAI_VISION_MODEL = 'test-vision';
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'test-vision'); assert.equal(body.store, false);
      assert.equal(body.messages[1].content[1].image_url.url, image);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ lessons: [lesson], warnings: ['Check room'] }) } }] }) };
    };
    const result = await extractTimetable(image);
    assert.equal(result.lessons[0].title, lesson.title); assert.deepEqual(result.warnings, ['Check room']);
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'invalid_api_key', message: 'secret-must-not-leak' } }) });
    await assert.rejects(extractTimetable(image), (error) => error.status === 502 && error.message.includes('401') && !error.message.includes('secret-must-not-leak'));
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 'insufficient_quota' } }) });
    await assert.rejects(extractTimetable(image), { status: 502 });
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    await assert.rejects(extractTimetable(image), { status: 502 });
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"lessons":[{}]}' } }] }) });
    await assert.rejects(extractTimetable(image), { status: 502 });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [['OPENAI_API_KEY', oldKey], ['OPENAI_MODEL', oldModel], ['OPENAI_VISION_MODEL', oldVision]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
