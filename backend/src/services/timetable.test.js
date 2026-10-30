import sharp from 'sharp';
import { preprocessTimetable } from './timetable-image.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLessons, validateImage, extractTimetable, normalizeExtraction, appendTimetable, clearTimetable } from './timetable.js';
const lesson = { title: 'Database', dayOfWeek: [1, 3], start: '09:00', end: '10:30', location: '205' };
const image = 'data:image/png;base64,' + (await sharp({create:{width:16,height:24,channels:4,background:'#ffffff'}}).png().toBuffer()).toString('base64');

test('append preserves existing schedules and reports conflicts without partial changes', () => {
  const original = { ...lesson, id: 'existing', kind: 'class', dayOfWeek: [1] };
  const db = { fixedBlocks: [original], timetableVisibleDays: [1] };
  appendTimetable(db, [{ ...lesson, title: '업무', kind: 'job', dayOfWeek: [2] }], [2]);
  assert.equal(db.fixedBlocks.length, 2);
  assert.equal(db.fixedBlocks[0], original);
  assert.deepEqual(db.timetableVisibleDays, [1, 2]);
  const before = structuredClone(db);
  assert.throws(() => appendTimetable(db, [{ ...lesson, title: '회의', kind: 'event', dayOfWeek: [1] }]), (error) => error.status === 409 && error.message.includes('월요일') && error.message.includes('회의') && error.message.includes('Database'));
  assert.deepEqual(db, before);
});

test('clear removes fixed timetable only; fresh import succeeds afterwards', () => {
  const routine = { ...lesson, id: 'routine', kind: 'routine', dayOfWeek: [0] };
  const db = { fixedBlocks: [routine, ...['class','job','event'].map((kind) => ({...lesson, id: kind, kind}))],
    tasks: [{id:'task'}], scheduledBlocks: [{id:'scheduled'}], timetableVisibleDays: [1,3],
    deletedCalendarItems: [{source:'fixed',id:'class'}, {source:'scheduled',id:'scheduled'}] };
  clearTimetable(db);
  assert.deepEqual(db.fixedBlocks, [routine]);
  assert.deepEqual(db.tasks, [{id:'task'}]);
  assert.deepEqual(db.scheduledBlocks, [{id:'scheduled'}]);
  assert.deepEqual(db.timetableVisibleDays, []);
  assert.deepEqual(db.deletedCalendarItems, [{source:'scheduled',id:'scheduled'}]);
  appendTimetable(db, [{...lesson, kind:'event'}]);
  assert.equal(db.fixedBlocks.length, 2);
});
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

test('OCR preserves exact minutes; cropped weekdays are not invented', () => {
  const result=normalizeExtraction({weekdayHeaderVisible:false,lessons:[{...lesson,start:'10:05',end:'10:25'}]});
  assert.equal(result.lessons[0].start,'10:05');assert.equal(result.lessons[0].end,'10:25');
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

test('strict time validation preserves minute boundaries', async () => {
 const {snapTimetableTime}=await import('./timetable.js');
 assert.equal(snapTimetableTime('10:30','start'),'10:30');
 assert.equal(snapTimetableTime('10:31','end'),'10:31');
 assert.equal(snapTimetableTime('10:75','start'),'');
 assert.equal(snapTimetableTime('24:01','end'),'');
 assert.equal(snapTimetableTime('23:50','end'),'23:50');
 assert.equal(snapTimetableTime('24:00','start'),'');
});

test('school periods preserve 50 minutes and unknown repetition requires review', () => {
  const periods = [{ period: 1, start: '09:00', end: '09:50' }];
  const draft = normalizeExtraction({ timetableType: 'school', periods, recurrence: 'unknown', lessons: [{ ...lesson, period: 1, start: '09:00', end: '09:50' }] });
  assert.equal(draft.lessons[0].end, '09:50');
  assert.equal(draft.requiresReview, true);
  const weekly = normalizeExtraction({ timetableType: 'school', periods, recurrence: 'weekly', lessons: [{ ...lesson, period: 1, end: '09:50' }] });
  assert.equal(weekly.requiresReview, false);
});

test('school row times override inflated block times across all weekdays', async () => {
  const { assertNoTimetableConflicts } = await import('./timetable.js');
  const periods = [
    { period: 5, start: '13:50', end: '14:40' },
    { period: 6, start: '14:50', end: '15:40' },
    { period: 7, start: '15:50', end: '16:40' },
  ];
  const lessons = [1,2,3,4,5].flatMap((day) => periods.map((row, index) => ({
    ...lesson, title: `요일${day} 교시${row.period}`, dayOfWeek: [day], period: row.period,
    start: ['13:30','14:30','15:30'][index], end: ['15:00','16:00','17:00'][index],
  })));
  const draft = normalizeExtraction({ timetableType: 'school', recurrence: 'weekly', periods, lessons });
  assert.equal(draft.lessons.length, 15);
  assert.deepEqual(draft.lessons.slice(0,3).map(({start,end}) => [start,end]), periods.map(({start,end}) => [start,end]));
  assert.doesNotThrow(() => assertNoTimetableConflicts(draft.lessons));
  assert.equal(draft.requiresReview, false);
});

test('missing or ambiguous school periods cannot reuse guessed block times', () => {
  for (const periods of [[], [{period: 5, start:'13:50', end:'14:40'}, {period: 5, start:'14:00', end:'15:00'}]]) {
    const draft = normalizeExtraction({ timetableType: 'school', recurrence: 'weekly', periods, lessons: [{...lesson, period: 5}] });
    assert.equal(draft.lessons[0].start, '');
    assert.equal(draft.lessons[0].end, '');
    assert.equal(draft.requiresReview, true);
  }
});

test('flexible study plans never become fixed lessons', () => {
  const draft = normalizeExtraction({ timetableType: 'study', recurrence: 'weekly', lessons: [{ ...lesson, title: '알고리즘 복습', kind: 'flexible' }] });
  assert.equal(draft.lessons.length, 0);
  assert.equal(draft.flexiblePlans[0].title, '알고리즘 복습');
  assert.equal(draft.requiresReview, true);
  assert.throws(() => validateLessons([{ ...lesson, kind: 'flexible' }]));
});

test('shift jobs preserve their kind and require employee review', () => {
  const draft = normalizeExtraction({ timetableType: 'shift', recurrence: 'weekly', lessons: [{ ...lesson, kind: 'job' }] });
  assert.equal(draft.requiresReview, true);
  assert.equal(validateLessons(draft.lessons)[0].kind, 'job');
  const unknownEmployee = normalizeExtraction({ timetableType: 'shift', recurrence: 'dated', lessons: [], reviewReasons: ['어느 직원인가요?'] });
  assert.equal(unknownEmployee.lessons.length, 0);
  assert.equal(unknownEmployee.requiresReview, true);
});

test('multiple employees are extracted separately and selected before importing', async () => {
  const draft = normalizeExtraction({ timetableType: 'shift', recurrence: 'weekly', lessons: [
    {...lesson, kind:'job', employeeName:'김민지'}, {...lesson, kind:'job', employeeName:'이준호'},
  ] });
  assert.deepEqual(draft.employees, ['김민지', '이준호']);
  assert.equal(draft.lessons.length, 2);
  assert.equal(draft.requiresReview, false);
  const { selectTimetableEmployee } = await import('../../../frontend/src/utils/selectTimetableEmployee.js');
  const selected = selectTimetableEmployee(draft, '이준호');
  assert.equal(selected.lessons.length, 1);
  assert.equal(selected.lessons[0].employeeName, '이준호');
  assert.equal(selectTimetableEmployee(draft), null);
  assert.throws(() => selectTimetableEmployee(draft, '없는 이름'));
  assert.equal(selectTimetableEmployee(draft, '김민지').lessons[0].employeeName, '김민지');
  assert.equal(draft.lessons.length, 2);
});

test('work and personal timetables accept non-class fixed events', () => {
  for (const timetableType of ['work', 'personal', 'study', 'unknown']) {
    const draft = normalizeExtraction({ timetableType, recurrence: 'weekly', lessons: [
      { ...lesson, title: '프로젝트 업무', kind: 'job', dayOfWeek: [1] },
      { ...lesson, title: '팀 회의', kind: 'event', dayOfWeek: [2] },
      { ...lesson, title: '운동', kind: 'event', dayOfWeek: [3] },
      { ...lesson, title: '고정 학습', kind: 'event', dayOfWeek: [4] },
    ] });
    assert.equal(draft.lessons.length, 4);
    assert.equal(draft.requiresReview, false);
    const saved = validateLessons(draft.lessons);
    assert.deepEqual(saved.map((item) => item.kind), ['job', 'event', 'event', 'event']);
    assert.deepEqual(saved.map((item) => item.title), ['프로젝트 업무', '팀 회의', '운동', '고정 학습']);
  }
});

test('daily employee columns retain date without a weekday header and do not repeat', async () => {
  const { timeline } = await import('../scheduler/timeline.js');
  const { blockedWindows } = await import('../scheduler/blocked-windows.js');
  const { selectTimetableEmployee } = await import('../../../frontend/src/utils/selectTimetableEmployee.js');
  const entries = [
    {title:'근무', kind:'job', start:'08:00', end:'11:00'},
    {title:'근무 중 휴게', kind:'event', start:'11:00', end:'12:00'},
    {title:'근무', kind:'job', start:'12:00', end:'15:00'},
  ];
  const draft = normalizeExtraction({ timetableType:'shift', recurrence:'dated', weekdayHeaderVisible:false,
    lessons: entries.map((entry) => ({...entry, date:'2026-11-03', employeeName:'유하나', dayOfWeek:[]})) });
  assert.equal(draft.requiresReview, false);
  const fixedBlocks = validateLessons(selectTimetableEmployee(draft).lessons);
  assert.ok(fixedBlocks.every((item) => item.date === '2026-11-03'));
  assert.deepEqual(fixedBlocks[0].dayOfWeek, [2]);
  const db = {fixedBlocks, tasks:[], scheduledBlocks:[]};
  assert.equal(timeline(db, '2026-11-03').items.length, 3);
  assert.equal(timeline(db, '2026-11-10').items.length, 0);
  const windows = blockedWindows('2026-11-03', fixedBlocks, {});
  assert.equal(windows.filter((item) => item.kind === 'fixed_and_travel').length, 3);
  assert.equal(blockedWindows('2026-11-10', fixedBlocks, {}).filter((item) => item.kind === 'fixed_and_travel').length, 0);
});

test('dated conflicts apply only on the same actual date and weekly occurrences', async () => {
  const { assertNoTimetableConflicts } = await import('./timetable.js');
  const { lessonConflicts } = await import('../../../frontend/src/utils/timetableConflicts.js');
  const a = {...lesson, id:'a', date:'2026-11-03', dayOfWeek:[2]};
  const nextWeek = {...a, id:'b', date:'2026-11-10'};
  assert.doesNotThrow(() => assertNoTimetableConflicts([a,nextWeek]));
  assert.equal(lessonConflicts(a,[nextWeek]).length, 0);
  const weekly = {...lesson, id:'weekly', dayOfWeek:[2]};
  assert.throws(() => assertNoTimetableConflicts([a,weekly]), {status:409});
  assert.equal(lessonConflicts(a,[weekly]).length, 1);
  assert.throws(() => validateLessons([{...a,date:'2026-02-30'}]));
});
