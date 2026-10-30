import useDeferredReschedule, { useRescheduling } from '../../hooks/useDeferredReschedule.js';

// 미리 완료 뒤 재배치 카운트다운 안내. 어느 탭에 있든 보인다.
export default function RescheduleNotice() {
  const { phase, secondsLeft, error } = useDeferredReschedule();
  // 카운트다운이 없어도 설정 저장·일정 추가처럼 서버가 바로 재배치하는 동안에는 진행 중임을 보여 준다
  const busy = useRescheduling();
  if (phase === 'idle') {
    if (!busy) return null;
    return (
      <div className="reschedule-notice is-running" role="status" aria-live="polite">
        <i className="spinner" aria-hidden="true" />
        <span>리스케쥴링 중이에요…</span>
      </div>
    );
  }
  return (
    <div className={`reschedule-notice is-${phase}`} role="status" aria-live="polite">
      {phase === 'countdown' && (
        <span>
          <strong>{secondsLeft}초</strong> 뒤 리스케쥴링이 시작됩니다
        </span>
      )}
      {phase === 'running' && (
        <>
          <i className="spinner" aria-hidden="true" />
          <span>리스케쥴링이 시작됩니다</span>
        </>
      )}
      {phase === 'error' && <span>리스케쥴링하지 못했어요. ({error})</span>}
    </div>
  );
}
