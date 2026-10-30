import { useState } from 'react';

// 캘린더 블록 상세 시트가 쓰는 화면 상태. 백엔드 연결 전까지 메모리에만 저장한다.
// status: 'done' | 'postponed' (없으면 예정)
export default function useBlockDetails() {
  const [toggled, setToggled] = useState(() => new Set()); // 샘플 기본값에서 완료 상태를 뒤집은 하위 작업 id
  const [statuses, setStatuses] = useState({}); // blockId → status
  const [memos, setMemos] = useState({}); // taskId → 메모
  const [files, setFiles] = useState({
    't-report': [{ id: 'f-sample', name: '캡스톤_보고서_안내문.pdf', size: 482113 }],
  }); // taskId → 첨부 목록

  const toggleSubtask = (id) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const statusOf = (blockId) => statuses[blockId] ?? null;

  // 같은 상태를 다시 누르면 해제된다
  const setStatus = (blockId, status) =>
    setStatuses((prev) => {
      const next = { ...prev };
      if (next[blockId] === status) delete next[blockId];
      else next[blockId] = status;
      return next;
    });

  const setMemo = (taskId, text) => setMemos((prev) => ({ ...prev, [taskId]: text }));

  const addFiles = (taskId, fileList) =>
    setFiles((prev) => ({
      ...prev,
      [taskId]: [
        ...(prev[taskId] ?? []),
        ...Array.from(fileList).map((f) => ({
          id: `${f.name}-${f.lastModified}-${Math.random().toString(36).slice(2, 6)}`,
          name: f.name,
          size: f.size,
        })),
      ],
    }));

  const removeFile = (taskId, fileId) =>
    setFiles((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? []).filter((f) => f.id !== fileId) }));

  return {
    toggled,
    toggleSubtask,
    statusOf,
    setStatus,
    memoOf: (taskId) => memos[taskId] ?? '',
    setMemo,
    filesOf: (taskId) => files[taskId] ?? [],
    addFiles,
    removeFile,
  };
}
