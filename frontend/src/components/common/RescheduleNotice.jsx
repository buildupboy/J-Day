import useDeferredReschedule from '../../hooks/useDeferredReschedule.js';

// 미리 완료 뒤 재배치 카운트다운 안내. 어느 탭에 있든 보인다.
export default function RescheduleNotice() {
  const { phase, secondsLeft, error } = useDeferredReschedule();
  if (phase === 'idle') return null;
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
