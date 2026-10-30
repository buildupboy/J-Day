export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function validText(value, name, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${name}는 1~${max}자 문자열이어야 합니다.`);
  return value.trim();
}
export function integer(value, name, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${name} 값이 올바르지 않습니다.`);
  return value;
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('유효한 YYYY-MM-DD 날짜가 필요합니다.');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail('존재하지 않는 날짜입니다.');
  return value;
}
export function deadline(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\+09:00$/.test(value)) fail('마감은 KST ISO 일시여야 합니다.');
  date(value.slice(0, 10));
  return value;
}
// strict JSON Schema도 외부 입력이다. 서버에서 다시 확인한다.
export function assertSchema(value, schema, path = 'AI 응답') {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = type => type === 'null' ? value === null
    : type === 'array' ? Array.isArray(value)
    : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : type === 'integer' ? Number.isSafeInteger(value)
    : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type;
  if (!types.some(matches) || (schema.enum && !schema.enum.includes(value))) fail(`${path} 형식이 올바르지 않습니다.`, 502);
  if (value === null) return;
  if (typeof value === 'string' && value.length > 2000) fail(`${path}가 너무 깁니다.`, 502);
  if (Array.isArray(value)) {
    if (value.length > 50) fail(`${path} 항목이 너무 많습니다.`, 502);
    value.forEach((item, i) => assertSchema(item, schema.items, `${path}[${i}]`));
  } else if (schema.properties) {
    if (schema.required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) fail(`${path} 필드가 올바르지 않습니다.`, 502);
    for (const [key, field] of Object.entries(schema.properties)) assertSchema(value[key], field, `${path}.${key}`);
  }
}
