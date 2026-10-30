import { api } from '../../api/client.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';
import { queueReschedule, EDIT_DELAY_MS } from '../../hooks/useDeferredReschedule.js';
import { offerUndo, markPending, notify } from '../../hooks/useUndo.js';
import { formatDuration, toMinutes } from '../../utils/time.js';

// 서버는 예정 종료 뒤 이만큼 기다렸다가 미수행으로 바꾸고 다시 배치한다 (backend MISSED_GRACE_MINUTES)
export const CHECK_IN_GRACE = 30;
const MORE = [15, 30, 60];

// 예정 시간이 끝났는데 종료 보고가 없을 때 아침 브리핑 자리에 뜨는 카드.
// 시간을 더 쓰거나(뒤 작업이 함께 밀린다), 오늘 남은 시간·내일로 미루거나, 작업을 끝낸다.
// 고른 동작은 실행 취소를 기다린 뒤 서버에 보낸다.
export default function CheckInCard({ block, nowMin, onFinish }) {
  const key = `checkin:${block.id}`;
  const left = Math.max(0, CHECK_IN_GRACE - (nowMin - toMinutes(block.end)));

  const act = (message, send) => {
    markPending(key, true);
    offerUndo({
      message,
      undo: () => markPending(key, false),
      commit: async () => {
        try {
          await send();
          scheduleChanged();
        } catch (error) {
          markPending(key, false);
          notify(error.message);
        }
      },
    });
  };

  const extend = (minutes) =>
    act(`'${block.title}' ${formatDuration(minutes)} 더 할게요`, async () => {
      const result = await api.extendBlock(block.id, minutes);
      // 밀다가 고정 일정과 겹쳐 빠진 작업은 30초 뒤 다시 배치한다
      if (result.dropped.length) {
        queueReschedule({ delayMs: EDIT_DELAY_MS, reason: 'manual' });
        notify(`뒤 작업 ${result.dropped.length}개는 고정 일정과 겹쳐 다시 배치할게요`);
      }
    });

  const postpone = (when) =>
    act(`'${block.title}' ${when === 'today' ? '오늘 남은 시간으로' : '내일로'} 미룰게요`, async () => {
      const result = await api.postponeTo([block.id], when);
      notify(`'${block.title}' ${result.date === block.date ? '오늘' : '내일'} ${result.start}부터 하도록 옮겼어요`);
    });

  return (
    <section className="d-card check-in" aria-label="진행 중인 작업 확인">
      <div className="briefing-who">
        <span className="j-mark" aria-hidden="true">
          J
        </span>
        <p>진행 확인</p>
      </div>
      <p className="briefing-text">
        ‘{block.title}’ 잘 되어 가나요? 예정 시간({block.end})이 지났어요. 시간이 더 필요하세요?
      </p>
      <p className="check-in-note">
        {left > 0 ? `${left}분 안에 고르지 않으면 남은 작업을 다른 시간에 다시 배치해요.` : '곧 남은 작업을 다른 시간에 다시 배치해요.'}
      </p>
      <div className="check-in-row" role="group" aria-label="시간 더 쓰기">
        {MORE.map((minutes) => (
          <button key={minutes} type="button" className="d-btn d-btn-dark" onClick={() => extend(minutes)}>
            +{formatDuration(minutes)}
          </button>
        ))}
      </div>
      <div className="d-grid-2">
        <button type="button" className="d-btn d-btn-line" onClick={() => postpone('today')}>
          오늘 남은 시간에
        </button>
        <button type="button" className="d-btn d-btn-line" onClick={() => postpone('tomorrow')}>
          내일로 미루기
        </button>
      </div>
      <button type="button" className="d-link d-link-center" onClick={onFinish}>
        다 했어요 · 작업 종료
      </button>
    </section>
  );
}
