import usePush from '../../hooks/usePush.js';

// 제이가 먼저 말을 걸 수 있게 푸시 알림을 켜고 끄는 버튼
export default function PushToggle() {
  const { supported, permission, subscribed, busy, error, enable, disable, test } = usePush();
  if (!supported) return <p className="d-meta">이 브라우저는 푸시 알림을 지원하지 않아요. iPhone은 홈 화면에 추가한 앱에서만 쓸 수 있어요.</p>;
  return (
    <div className="push-toggle">
      <div className="chip-row">
        <button type="button" className="chip" disabled={busy || permission === 'denied'} onClick={subscribed ? disable : enable}>
          {subscribed ? '알림 끄기' : '알림 받기'}
        </button>
        {subscribed && <button type="button" className="chip" onClick={test}>테스트 알림 보내기</button>}
      </div>
      {permission === 'denied' && <p className="d-error">알림이 차단돼 있어요. 브라우저 설정에서 허용해 주세요.</p>}
      {error && <p className="d-error">{error}</p>}
    </div>
  );
}
