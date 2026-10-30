import { useState } from 'react';

// 홈 "오늘 할 일" 항목의 편집·이동 상태. 백엔드 연결 전까지 메모리에만 저장한다.
export default function useTodoActions() {
  const [meta, setMeta] = useState({}); // id → { title, memo, alarm, routine }
  const [hidden, setHidden] = useState({}); // id → 오늘 목록에서 빠진 이유(토스트 문구)

  const patch = (id, fields) => setMeta((prev) => ({ ...prev, [id]: { ...prev[id], ...fields } }));

  return {
    metaOf: (id) => meta[id] ?? {},
    patch,
    isHidden: (id) => id in hidden,
    hide: (id, message) => setHidden((prev) => ({ ...prev, [id]: message })),
  };
}
