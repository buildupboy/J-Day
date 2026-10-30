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
  getUserSettings: () => request('/user/settings'),
  saveUserSettings: (settings) => request('/user/settings', { method: 'PATCH', body: { settings, confirmReschedule: true } }),
  getAnalytics: (mode = 'week', from) => request(`/analytics/${mode}${from ? `?from=${encodeURIComponent(from)}` : ''}`),
  getTimetable: () => request('/timetable'),
  extractTimetable: async (image) => {
    const photo = await fetch(image).then((response) => response.blob());
    const form = new FormData();
    form.append('image', photo, 'timetable');
    const response = await fetch('/api/timetable/ocr', { method: 'POST', body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
    return data;
  },
  saveTimetable: (lessons, visibleDays = [], { clearExisting = false } = {}) => request('/timetable', { method: 'PUT', body: { lessons, visibleDays, clearExisting } }),
  appendTimetable: (lessons, visibleDays = []) => request('/timetable', { method: 'POST', body: { lessons, visibleDays } }),
  clearTimetable: () => request('/timetable', { method: 'DELETE' }),
  health: () => request('/health'),

  // 음성 텍스트 해석
  interpret: (text, { requestId = crypto.randomUUID(), conversation = [] } = {}) =>
    request('/chat/interpret', { method: 'POST', body: { text, requestId, conversation } }),

  // 작업
  getTasks: () => request('/tasks'),
  createTask: (task) => request('/tasks', { method: 'POST', body: task }),
  reportProgress: (taskId, payload) => request(`/tasks/${taskId}/progress`, { method: 'PATCH', body: payload }),

  deleteCalendarItem: (source, id, date) => request(`/schedule/items/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, { method: 'DELETE', body: { date } }),


  // 일정
  getTodaySchedule: () => request('/schedule/today'),
  getWeekSchedule: (from) => request(`/schedule/week?from=${encodeURIComponent(from)}`),
  reschedule: (reason = 'manual') => request('/schedule/reschedule', { method: 'POST', body: { reason } }),
};
