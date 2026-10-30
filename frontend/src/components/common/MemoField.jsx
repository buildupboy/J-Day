const MAX_MEMO = 1000; // 서버 제한과 같다

// 등록 화면 맨 아래의 메모 입력
export default function MemoField({ id, value, onChange, placeholder }) {
  return (
    <div className="d-field">
      <label htmlFor={id}>메모</label>
      <textarea
        id={id}
        className="d-textarea"
        rows={3}
        maxLength={MAX_MEMO}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value.length > MAX_MEMO * 0.9 && (
        <p className="d-meta memo-count">
          {value.length} / {MAX_MEMO}
        </p>
      )}
    </div>
  );
}
