import { useRef } from 'react';

const CLOSE_DISTANCE = 90; // px 이상 내리면 닫는다
const FAST_DISTANCE = 30; // 이만큼만 내려도 빠르게 쓸어내리면 닫는다
const FAST_SPEED = 0.6; // px/ms
const ANIMATION_MS = 180;

// 바텀 시트 맨 위의 손잡이. 잡고 아래로 내리면 시트가 따라 내려가고, 충분히 내리면 닫힌다.
// 시트(.sheet, .d-sheet)의 첫 번째 자식으로 둔다.
export default function SheetHandle({ onClose }) {
  const drag = useRef(null);

  const finish = (event, canceled) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    const { sheet, startY, startAt } = current;
    const distance = Math.max(0, event.clientY - startY);
    const speed = distance / Math.max(1, Date.now() - startAt);
    sheet.style.transition = `transform ${ANIMATION_MS}ms ease-out`;
    if (!canceled && (distance > CLOSE_DISTANCE || (distance > FAST_DISTANCE && speed > FAST_SPEED))) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(onClose, ANIMATION_MS - 20);
    } else {
      sheet.style.transform = '';
    }
  };

  return (
    <div
      className="sheet-grab"
      role="button"
      tabIndex={0}
      aria-label="시트 닫기 (아래로 끌어내리세요)"
      onPointerDown={(event) => {
        const sheet = event.currentTarget.closest('.sheet, .d-sheet');
        if (!sheet) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        sheet.style.transition = 'none';
        drag.current = { sheet, startY: event.clientY, startAt: Date.now() };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        current.sheet.style.transform = `translateY(${Math.max(0, event.clientY - current.startY)}px)`;
      }}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
