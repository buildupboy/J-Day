// 백엔드 호출 함수 모음. vite 프록시로 /api → http://localhost:3001
// API 키 등 비밀값은 절대 여기에 두지 않는다.

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  getAnalytics: (mode = 'week', from) => request(`/analytics/${mode}${from ? `?from=${encodeURIComponent(from)}` : ''}`),
  getTimetable: () => request('/timetable'),
  extractTimetable: (image) => request('/timetable/extract', { method: 'POST', body: { image } }),
  saveTimetable: (lessons) => request('/timetable', { method: 'PUT', body: { lessons } }),
  health: () => request('/health'),

  // 음성 텍스트 해석
  interpret: (text) => request('/chat/interpret', { method: 'POST', body: { text } }),

  // 작업
  getTasks: () => request('/tasks'),
  createTask: (task) => request('/tasks', { method: 'POST', body: task }),
  reportProgress: (taskId, payload) => request(`/tasks/${taskId}/progress`, { method: 'PATCH', body: payload }),

  // 일정
  getTodaySchedule: () => request('/schedule/today'),
  reschedule: (reason = 'manual') => request('/schedule/reschedule', { method: 'POST', body: { reason } }),
};
