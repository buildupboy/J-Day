import useUndoOffer, { undoLast } from '../../hooks/useUndo.js';

// 완료·삭제·수정 직후 잠깐 뜨는 '실행 취소' 안내. 어느 화면에서든 보인다.
export default function UndoToast() {
  const offer = useUndoOffer();
  if (!offer) return null;
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{offer.message}</span>
      {offer.undo && (
        <button type="button" onClick={undoLast}>
          실행 취소
        </button>
      )}
    </div>
  );
}
