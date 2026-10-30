// 끝과 시작이 맞닿는 일정은 허용한다. 시간 미확인 초안은 별도로 검증한다.
export function lessonConflicts(lesson, others) {
  if (!lesson.start || !lesson.end || lesson.start >= lesson.end) return [];
  return others.filter((item) => item.id !== lesson.id && item.start && item.end && lesson.dayOfWeek.some((day) => item.dayOfWeek?.includes(day)) && lesson.start < item.end && item.start < lesson.end);
}
