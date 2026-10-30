import ChatPanel from './ChatPanel.jsx';

// 마이크 탭을 누르면 아래에서 올라오는 제이 대화창
export default function ChatSheet({ onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>제이</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <ChatPanel />
      </section>
    </div>
  );
}
