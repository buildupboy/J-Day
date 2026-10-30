import { getBlocksForDate } from './sampleSchedule.js';
import { parseTaskText, toIsoDate } from '../utils/parseTaskText.js';

// TODO: 백엔드 POST /api/chat/interpret 이 구현되면 이 파일은 지운다.
// 아직 501을 돌려주는 동안 화면 시연용으로 같은 응답 모양({ intent, reply, result })을 흉내 낸다.

const DEMO_SUBTASKS = [
  { title: '자료 조사', estimatedMinutes: 180 },
  { title: '초안 작성', estimatedMinutes: 240 },
  { title: '발표 자료 제작', estimatedMinutes: 240 },
  { title: '최종 검토', estimatedMinutes: 120 },
];

// 마지막 글자에 받침이 있으면 true (을/를 고르기용)
function hasBatchim(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

export async function mockInterpret(text) {
  await new Promise((r) => setTimeout(r, 400)); // 생각하는 척하는 시간

  if (/오늘.*(뭐|일정|할 ?일)/.test(text)) {
    const items = getBlocksForDate(new Date())
      .filter((b) => b.kind !== 'break')
      .slice(0, 4)
      .map((b) => `${b.start} ${b.title}`);
    return {
      intent: 'query_schedule',
      reply: `오늘 일정이에요.\n${items.join('\n')}`,
      result: {},
    };
  }

  if (/(절반|반|\d+\s*%).*(했|끝)/.test(text)) {
    return {
      intent: 'report_progress',
      reply: '수고했어요! 진행 상황을 기록했어요. 남은 분량은 빈 시간에 다시 배치할게요.',
      result: {},
    };
  }

  if (/미뤄|미루/.test(text)) {
    return {
      intent: 'reschedule',
      reply: '알겠어요. 남은 일정을 내일로 옮겨서 다시 배치할게요.',
      result: {},
    };
  }

  const parsed = parseTaskText(text);
  const title = parsed.title || '새 작업';
  const fallbackDeadline = new Date();
  fallbackDeadline.setDate(fallbackDeadline.getDate() + 7);

  return {
    intent: 'add_task',
    reply: `알겠어요!\n${title}${hasBatchim(title) ? '을' : '를'} 일정에 추가해드릴게요.\n작업량을 분석해서 다음과 같이 일정을 제안해요.`,
    result: {
      task: {
        title,
        deadline: parsed.deadline ?? toIsoDate(fallbackDeadline),
        estimatedMinutes: DEMO_SUBTASKS.reduce((sum, st) => sum + st.estimatedMinutes, 0),
        subtasks: DEMO_SUBTASKS,
      },
    },
  };
}
