// 전체 발화가 재생 제어 명령일 때만 처리해 일정 요청과 혼동하지 않는다.
export function voicePlaybackCommand(text) {
  const command = text.replace(/[\s.!?,。！？]/g, '').replace(/^(?:헤이)?제이야?/, '');
  const please = '(?:줘|주세요|줄래|줄래요|줄수있어|줄수있어요)?';
  const target = '(?:소리|음성|음성응답|스피커)(?:를|을)?';
  if (new RegExp(`^(?:${target}켜${please}|음소거(?:를)?해제(?:해${please})?)$`).test(command)) return 'unmute';
  if (new RegExp(`^(?:${target}꺼${please}|음소거(?:해${please})?)$`).test(command)) return 'mute';
  return null;
}
