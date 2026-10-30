export default function MicButton({ listening, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`mic-button ${listening ? 'is-listening' : ''}`}
      disabled={disabled}
      onClick={onClick}
      aria-label={listening ? '듣기 중지' : '말하기'}
    >
      {listening ? '■ 듣는 중…' : '🎤 말하기'}
    </button>
  );
}
