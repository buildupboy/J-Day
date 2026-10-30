// 분 단위 길이를 'N시간 M분'으로 보여 준다. 마이 > 작업 스타일의 요약과 안내에 쓴다.
export function dailyDuration(minutes) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return '시간을 입력해 주세요';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours ? hours + '시간' : '', rest || !hours ? rest + '분' : ''].filter(Boolean).join(' ');
}
