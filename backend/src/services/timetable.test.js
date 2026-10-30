import sharp from 'sharp';
import { preprocessTimetable } from './timetable-image.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLessons, validateImage, extractTimetable, normalizeExtraction } from './timetable.js';
const lesson = { title: 'Database', dayOfWeek: [1, 3], start: '09:00', end: '10:30', location: '205' };
const image = 'data:image/png;base64,' + (await sharp({create:{width:16,height:24,channels:4,background:'#ffffff'}}).png().toBuffer()).toString('base64');
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
  assert.throws(() => validateImage('data:image/png;base64,' + Buffer.alloc(11 * 1024 * 1024).toString('base64')));
});
test('extract handles configuration, provider failure, and validates provider JSON', async () => {
  const oldKey = process.env.OPENAI_API_KEY, oldModel = process.env.OPENAI_MODEL, oldVision = process.env.OPENAI_TIMETABLE_MODEL;
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(extractTimetable(image), { status: 503 });
    process.env.OPENAI_API_KEY = 'test-only'; process.env.OPENAI_TIMETABLE_MODEL = 'test-vision';
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'test-vision'); assert.equal(body.store, false);
      assert.ok(body.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,')); assert.equal(body.response_format.type, 'json_schema'); assert.equal(body.response_format.json_schema.strict,true);
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
    for (const [key, value] of [['OPENAI_API_KEY', oldKey], ['OPENAI_MODEL', oldModel], ['OPENAI_TIMETABLE_MODEL', oldVision]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('partial extraction keeps all courses and preserves 90-minute and 3-hour times', () => {
  const result = normalizeExtraction({ lessons: [
    {...lesson,title:'VR',start:'10:30',end:'12:00'},
    {...lesson,title:'SW',start:'12:00',end:'15:00'},
    {...lesson,title:'Compiler',start:'15:00',end:'16:30'},
    {...lesson,title:'Friday',start:'14:00',end:null},
    {...lesson,title:'Unknown day',dayOfWeek:[],start:null,end:null},
  ]});
  assert.equal(result.lessons.length,5);
  assert.deepEqual(result.lessons.slice(0,3).map(({start,end})=>[start,end]),[['10:30','12:00'],['12:00','15:00'],['15:00','16:30']]);
  assert.equal(result.lessons[3].start,'14:00'); assert.equal(result.lessons[3].end,'');
  assert.equal(result.warnings.length,2);
  assert.throws(()=>validateLessons(result.lessons));
  result.lessons[3].end='18:00'; result.lessons[4].dayOfWeek=[2];result.lessons[4].start='09:00';result.lessons[4].end='10:00';
  assert.equal(validateLessons(result.lessons).length,5);
});

test('single structured request preserves half-hour start', async () => {
  const originalFetch = globalThis.fetch;
  const oldKey=process.env.OPENAI_API_KEY, oldModel=process.env.OPENAI_TIMETABLE_MODEL;
  process.env.OPENAI_API_KEY='test-only'; process.env.OPENAI_TIMETABLE_MODEL='test-vision';
  let calls=0;
  try {
    globalThis.fetch=async()=>{
      calls++;
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({lessons:[{...lesson,start:'16:30',end:'18:00'}],warnings:[]})}}]})};
    };
    const result=await extractTimetable(image);
    assert.equal(calls,1); assert.equal(result.lessons[0].start,'16:30');
  } finally {
    globalThis.fetch=originalFetch;
    if(oldKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=oldKey;
    if(oldModel===undefined) delete process.env.OPENAI_TIMETABLE_MODEL; else process.env.OPENAI_TIMETABLE_MODEL=oldModel;
  }
});

test('OCR times snap outward to half-hour slots; cropped weekdays are not invented', () => {
  const result=normalizeExtraction({weekdayHeaderVisible:false,lessons:[{...lesson,start:'10:05',end:'10:25'}]});
  assert.equal(result.lessons[0].start,'10:00');assert.equal(result.lessons[0].end,'10:30');
  assert.deepEqual(result.lessons[0].dayOfWeek,[]);assert.equal(result.warnings.length,1);
});

test('server preprocessing rotates EXIF and bounds JPEG; rejects corrupted data', async () => {
  const png=await sharp({create:{width:2600,height:100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
  const prepared=await preprocessTimetable('data:image/png;base64,'+png.toString('base64'));
  const meta=await sharp(Buffer.from(prepared.image.split(',')[1],'base64')).metadata();
  assert.equal(meta.format,'jpeg');assert.ok(meta.width<=1600);assert.ok(meta.height<=2400);
  const rotated=await sharp({create:{width:100,height:50,channels:3,background:'#fff'}}).withMetadata({orientation:6}).jpeg().toBuffer();
  const normalized=await preprocessTimetable('data:image/jpeg;base64,'+rotated.toString('base64'));
  const dimensions=await sharp(Buffer.from(normalized.image.split(',')[1],'base64')).metadata();
  assert.equal(dimensions.width,50);assert.equal(dimensions.height,100);
  await assert.rejects(preprocessTimetable('data:image/png;base64,aGVsbG8='),{status:422});
});

test('overlap is rejected including other routines; touching times and other weekdays allowed', async () => {
  const {assertNoTimetableConflicts}=await import('./timetable.js');
  const a={...lesson,id:'a',dayOfWeek:[1],start:'10:30',end:'12:00'};
  const overlap={...lesson,id:'b',dayOfWeek:[1],start:'11:30',end:'13:00'};
  assert.throws(()=>assertNoTimetableConflicts([a,overlap]),{status:409});
  assert.throws(()=>assertNoTimetableConflicts([a],[{...overlap,kind:'job'}]),{status:409});
  assert.doesNotThrow(()=>assertNoTimetableConflicts([a,{...overlap,start:'12:00'}]));
  assert.doesNotThrow(()=>assertNoTimetableConflicts([a,{...overlap,dayOfWeek:[2]}]));
  const {lessonConflicts}=await import('../../../frontend/src/utils/timetableConflicts.js');
  assert.equal(lessonConflicts(a,[a,overlap]).length,1);
  assert.equal(lessonConflicts(a,[{...overlap,start:'12:00'}]).length,0);
});

test('strict time validation and half-hour normalization', async () => {
 const {snapTimetableTime}=await import('./timetable.js');
 assert.equal(snapTimetableTime('10:30','start'),'10:30');
 assert.equal(snapTimetableTime('10:31','end'),'11:00');
 assert.equal(snapTimetableTime('10:75','start'),'');
 assert.equal(snapTimetableTime('24:01','end'),'');
 assert.equal(snapTimetableTime('23:50','end'),'24:00');
 assert.equal(snapTimetableTime('24:00','start'),'');
});
