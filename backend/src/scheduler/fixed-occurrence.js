export function validFixedDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function fixedOccursOn(block, date) {
  return block.date ? block.date === date : block.dayOfWeek?.includes(new Date(`${date}T00:00:00Z`).getUTCDay());
}

export function fixedSchedulesShareDay(a, b) {
  if (a.date) return fixedOccursOn(b, a.date);
  if (b.date) return fixedOccursOn(a, b.date);
  return a.dayOfWeek?.some((day) => b.dayOfWeek?.includes(day));
}
