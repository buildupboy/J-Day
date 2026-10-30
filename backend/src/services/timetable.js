import { randomUUID } from 'node:crypto';
import { preprocessTimetable, TIMETABLE_FORMAT } from './timetable-image.js';
import { TIMETABLE_RULES } from './timetable-rules.js';
import { validFixedDate, fixedSchedulesShareDay } from '../scheduler/fixed-occurrence.js';

// 사진에서 읽은 초안은 저장 데이터와 다르다. 불확실한 일정도 삭제하지 않는다.
export function snapTimetableTime(value, boundary) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!match) return '';
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 24 || (hour === 24 && (minute !== 0 || boundary === 'start'))) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeExtraction(result) {
  if (!Array.isArray(result.lessons) || result.lessons.length > 100) throw new Error('일정 목록 형식 오류');
  const periods = Array.isArray(result.periods) ? result.periods : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter((item) => typeof item === 'string').slice(0, 20).map((item) => item.slice(0, 300)) : [];
  const reviewReasons = Array.isArray(result.reviewReasons) ? result.reviewReasons.filter((item) => typeof item === 'string').slice(0, 20).map((item) => item.slice(0, 300)) : [];
  if (result.recurrence !== 'weekly' && !(result.recurrence === 'dated' && result.lessons.length && result.lessons.every((item) => validFixedDate(item?.date)))) reviewReasons.push('반복 일정인지, 특정 날짜의 일정인지 확인해 주세요.');
  const lessons = result.lessons.map((item) => {
    if (!item || typeof item.title !== 'string') throw new Error('일정 이름 형식 오류');
    const title = item.title.trim().slice(0, 100) || '일정 이름 확인 필요';
    const date = validFixedDate(item.date) ? item.date : null;
    if (item.date && !date) reviewReasons.push(`${title}: 날짜를 확인해 주세요.`);
    const days = date ? [new Date(`${date}T00:00:00Z`).getUTCDay()] : result.weekdayHeaderVisible === false ? [] : Array.isArray(item.dayOfWeek) ? [...new Set(item.dayOfWeek.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))] : [];
    // 교시형 표는 행의 명시된 시간을 사용한다. 블록 높이에서 추정한 시각은 사용하지 않는다.
    const matchingPeriods = periods.filter((period) => Number.isInteger(item.period) && period.period === item.period);
    const timing = result.timetableType === 'school' ? (matchingPeriods.length === 1 ? matchingPeriods[0] : {}) : item;
    const start = snapTimetableTime(timing.start, 'start');
    let end = snapTimetableTime(timing.end, 'end');
    if (start && end && start >= end) end = '';
    if (!start || !end || !days.length) warnings.push(`${title}: 읽지 못한 요일·시간은 일정 목록에서 입력해 주세요. 일정은 삭제하지 않았어요.`);
    return { id: randomUUID(), ...(date ? { date } : {}), kind: item.kind ?? 'class', employeeName: typeof item.employeeName === 'string' ? item.employeeName.trim().slice(0, 100) : null, source: 'timetable', title, location: typeof item.location === 'string' ? item.location.slice(0, 150) : '', dayOfWeek: days, start, end };
  });
  const visibleDays = result.weekdayHeaderVisible === false ? [] : Array.isArray(result.visibleDays) ? [...new Set(result.visibleDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))] : [...new Set(lessons.flatMap((lesson) => lesson.dayOfWeek))];
  const flexiblePlans = lessons.filter((item) => item.kind === 'flexible' || item.kind === 'unknown');
  if (flexiblePlans.length) reviewReasons.push('공부·활동 계획은 고정 일정으로 저장하지 않아요. 작업의 마감일과 실제 소요 시간을 확인해 주세요.');
  const fixedLessons = lessons.filter((item) => ['class', 'job', 'event'].includes(item.kind));
  const employees = [...new Set(fixedLessons.map((item) => item.employeeName).filter(Boolean))];
  if (result.timetableType === 'shift' && (!employees.length || fixedLessons.some((item) => !item.employeeName))) reviewReasons.push('직원별 이름을 읽지 못했어요. 이름이 보이는 근무표를 선택해 주세요.');
  const requiresReview = reviewReasons.length > 0 || warnings.length > 0 || fixedLessons.some((item) => !item.start || !item.end || !item.dayOfWeek.length);
  return { lessons: fixedLessons, employees, flexiblePlans, warnings, visibleDays, timetableType: result.timetableType ?? 'unknown', recurrence: result.recurrence ?? 'unknown', reviewReasons, requiresReview };
}
export function assertNoTimetableConflicts(lessons, otherBlocks = []) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  for (let index = 0; index < lessons.length; index++) {
    const a = lessons[index];
    for (const b of [...lessons.slice(index + 1), ...otherBlocks]) {
      const day = a.dayOfWeek.find((value) => b.dayOfWeek?.includes(value));
      if (fixedSchedulesShareDay(a, b) && a.start < b.end && b.start < a.end) {
        throw Object.assign(new Error(`${a.date ?? b.date ?? `${days[day]}요일`} '${a.title}' (${a.start}–${a.end})와 '${b.title}' (${b.start}–${b.end}) 시간이 겹쳐요.`), { status: 409 });
      }
    }
  }
}

export function appendTimetable(db, lessons, visibleDays = []) {
  const added = validateLessons(lessons);
  assertNoTimetableConflicts(added, db.fixedBlocks ?? []);
  db.fixedBlocks = [...(db.fixedBlocks ?? []), ...added];
  db.timetableVisibleDays = [...new Set([...(db.timetableVisibleDays ?? []), ...visibleDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6), ...added.flatMap((item) => item.dayOfWeek)])];
  return added;
}

export function clearTimetable(db) {
  const removed = new Set((db.fixedBlocks ?? []).filter((block) => block.kind !== 'routine').map((block) => block.id));
  db.fixedBlocks = (db.fixedBlocks ?? []).filter((block) => !removed.has(block.id));
  db.deletedCalendarItems = (db.deletedCalendarItems ?? []).filter((item) => item.source !== 'fixed' || !removed.has(item.id));
  db.timetableVisibleDays = [];
}

export function validateLessons(lessons) {
  if (!Array.isArray(lessons) || lessons.length > 100) throw new Error('일정 목록은 최대 100개까지 등록할 수 있어요.');
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return lessons.map((lesson, index) => {
    if (!lesson || typeof lesson.title !== 'string' || !lesson.title.trim() || lesson.title.length > 100 || !Array.isArray(lesson.dayOfWeek) || !lesson.dayOfWeek.length || lesson.dayOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || !time.test(lesson.start) || !(time.test(lesson.end) || lesson.end === '24:00') || lesson.start >= lesson.end || (lesson.location != null && (typeof lesson.location !== 'string' || lesson.location.length > 150))) {
      throw new Error(`${index + 1}번째 일정의 이름·요일·시작/종료 시간을 확인해 주세요.`);
    }
    if (lesson.travelMinutes !== undefined && (!Number.isInteger(lesson.travelMinutes) || lesson.travelMinutes < 0 || lesson.travelMinutes > 1440)) throw new Error('이동시간은 0~1440분이어야 합니다.');
    if (lesson.kind && !['class', 'job', 'event'].includes(lesson.kind)) throw new Error('유동적인 계획은 고정 시간표로 저장할 수 없어요.');
    if (lesson.date != null && !validFixedDate(lesson.date)) throw new Error('일정 날짜를 확인해 주세요.');
    return { ...(lesson.date ? { date: lesson.date } : {}), ...(lesson.travelMinutes === undefined ? {} : { travelMinutes: lesson.travelMinutes }), id: randomUUID(), kind: lesson.kind ?? 'class', source: 'timetable', title: lesson.title.trim(), location: (lesson.location || '').trim(), dayOfWeek: lesson.date ? [new Date(`${lesson.date}T00:00:00Z`).getUTCDay()] : [...new Set(lesson.dayOfWeek)], start: lesson.start, end: lesson.end };
  });
}

export function validateImage(image) {
  const match = typeof image === 'string' && image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw new Error('PNG, JPG, WebP 시간표 사진을 선택해 주세요.');
  const data = Buffer.from(match[2], 'base64');
  if (!data.length || data.length > 10 * 1024 * 1024) throw new Error('사진은 10MB 이하로 올려 주세요.');
  const valid = match[1] === 'png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255 : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('사진 파일 형식이 올바르지 않아요.');
  return image;
}

export function validateTimetableImages(image, details = []) {
  validateImage(image);
  if (!Array.isArray(details) || details.length > 2) throw new Error('부분 확대 이미지는 최대 2개까지 가능해요.');
  details.forEach(validateImage);
  const bytes = [image, ...details].reduce((sum, data) => sum + Buffer.byteLength(data.split(',')[1], 'base64'), 0);
  if (bytes > 10 * 1024 * 1024) throw new Error('사진과 확대본 용량이 너무 커요. 더 작은 사진을 선택해 주세요.');
}

export async function extractTimetable(image, details = []) {
  validateTimetableImages(image, details);
  const prepared = await preprocessTimetable(image);
  image = prepared.image;
  details = []; // 부분 확대본을 별도 시간표로 중복 해석하지 않도록 전처리된 원본만 사용
  const detailContent = details.flatMap((url, index) => [{ type: 'text', text: `${index === 0 ? '왼쪽' : '오른쪽'} 부분 확대본. 원본과 겹치는 영역이 있으므로 일정을 중복 등록하지 마세요. 열 순서와 시각은 원본 기준입니다.` }, { type: 'image_url', image_url: { url, detail: 'high' } }]);
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_TIMETABLE_MODEL || 'gpt-5.4';
  if (!key || !model) throw Object.assign(new Error('백엔드에 OPENAI_API_KEY와 이미지 입력을 지원하는 OPENAI_MODEL을 설정해 주세요. 직접 입력은 사용할 수 있어요.'), { status: 503 });
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, store: false, response_format: TIMETABLE_FORMAT, messages: [
        { role: 'system', content: TIMETABLE_RULES },
        { role: 'user', content: [{ type: 'text', text: '시간표의 종류, 실제 시간, 고정·유동 여부와 반복 근거를 확인하여 추출해 주세요. 불확실한 정보는 reviewReasons로 질문해 주세요.' }, { type: 'image_url', image_url: { url: image, detail: 'high' } }, ...detailContent] },
      ] }),
    });
  } catch { throw Object.assign(new Error('시간표 분석 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'), { status: 502 }); }
  if (!response.ok) {
    // 제공자 오류 메시지는 키 일부나 요청 정보를 포함할 수 있어 그대로 노출하지 않는다.
    const body = await response.json().catch(() => ({}));
    const code = body.error?.code;
    let message = '사진 분석 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (response.status === 401 || code === 'invalid_api_key') {
      message = 'OpenAI가 API 키를 거절했어요 (401). backend/.env의 OPENAI_API_KEY를 유효한 API 키로 교체하고 백엔드를 재시작해 주세요.';
    } else if (code === 'insufficient_quota') {
      message = 'OpenAI API 사용 잔액 또는 이용 한도가 부족해요. API 결제·사용 한도를 확인해 주세요.';
    } else if (response.status === 429) {
      message = '분석 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
    } else if (response.status === 404 || code === 'model_not_found') {
      message = '설정한 모델을 찾을 수 없거나 접근 권한이 없어요. OPENAI_MODEL 또는 OPENAI_VISION_MODEL을 확인해 주세요.';
    } else if (response.status === 403) {
      message = '현재 API 프로젝트에서 이 요청을 사용할 권한이 없어요. 프로젝트와 모델 접근 권한을 확인해 주세요.';
    } else if (['image_parse_error', 'invalid_image', 'invalid_image_format', 'image_too_small', 'image_too_large'].includes(code)) {
      message = '사진 파일을 읽지 못했어요. 시간표를 새로 캡처해서 PNG 또는 JPG로 다시 올려 주세요.';
    } else if (response.status === 400) {
      message = '사진 또는 요청 형식을 모델이 지원하지 않아요. 이미지 입력과 JSON 출력을 지원하는 모델인지 확인해 주세요.';
    }
    throw Object.assign(new Error(message), { status: 502 });
  }
  try {
    const body = await response.json();
    const result = JSON.parse(body.choices[0].message.content);

    const draft = normalizeExtraction(result);
    if (!draft.lessons.length) return draft;
    return draft;
  } catch { throw Object.assign(new Error('분석 결과의 시간 형식을 확인하지 못했어요. 시간축이 잘 보이는 사진으로 다시 시도해 주세요.'), { status: 502 }); }
}
