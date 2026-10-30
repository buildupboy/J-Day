// 끝과 시작이 맞닿는 일정은 허용한다. 시간 미확인 초안은 별도로 검증한다.
export function lessonConflicts(lesson, others) {
  if (!lesson.start || !lesson.end || lesson.start >= lesson.end) return [];
  const sharesDay = (item) => lesson.date && item.date ? lesson.date === item.date
    : lesson.date ? item.dayOfWeek?.includes(new Date(`${lesson.date}T00:00:00Z`).getUTCDay())
      : item.date ? lesson.dayOfWeek.includes(new Date(`${item.date}T00:00:00Z`).getUTCDay())
        : lesson.dayOfWeek.some((day) => item.dayOfWeek?.includes(day));
  return others.filter((item) => item.id !== lesson.id && item.start && item.end && sharesDay(item) && lesson.start < item.end && item.start < lesson.end);
}
