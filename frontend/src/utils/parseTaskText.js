// 말한 문장에서 작업 이름과 마감일을 뽑는 간단한 규칙 파서.
// TODO: 백엔드 LLM(interpretUtterance)이 연결되면 그 결과로 대체한다.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toIsoDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' → "12월 3일 (목)" */
export function formatDeadline(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

// 해당 날짜가 속한 주의 월요일
function mondayOf(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/**
 * @param {string} raw 예: "12월 3일까지 캡스톤 보고서 끝내야 해"
 * @returns {{ title: string, deadline: string | null }} 마감일을 못 찾으면 deadline은 null
 */
export function parseTaskText(raw) {
  let text = raw.replace(/^헤이\s*제이[,\s]*/, '').trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let deadline = null;
  let m;

  if ((m = text.match(/(\d{1,2})월\s*(\d{1,2})일/))) {
    const d = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (d < today) d.setFullYear(d.getFullYear() + 1); // 이미 지난 날짜면 내년
    deadline = toIsoDate(d);
    text = text.replace(m[0], '');
  } else if ((m = text.match(/(이번\s*주|다음\s*주)?\s*([일월화수목금토])요일/))) {
    const target = WEEKDAYS.indexOf(m[2]);
    let d = addDays(today, (target - today.getDay() + 7) % 7 || 7); // 오늘 이후 가장 가까운 그 요일
    if (/다음/.test(m[1] ?? '') && mondayOf(d).getTime() === mondayOf(today).getTime()) d = addDays(d, 7);
    deadline = toIsoDate(d);
    text = text.replace(m[0], '');
  } else if ((m = text.match(/모레|내일|오늘/))) {
    deadline = toIsoDate(addDays(today, { 오늘: 0, 내일: 1, 모레: 2 }[m[0]]));
    text = text.replace(m[0], '');
  }

  const title = text
    .replace(/^\s*(까지|에|은|는)\s*/, '')
    .replace(/\s*\S+야\s*(해|돼|함)\s*[.!?]*\s*$/, '') // "끝내야 해", "만들어야 돼" 등
    .replace(/\s*(이|가)?\s*(있어|생겼어|있음)\s*[.!?]*\s*$/, '')
    .replace(/\s*까지\s*$/, '')
    .trim();

  return { title, deadline };
}
