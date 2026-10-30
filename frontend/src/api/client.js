// 백엔드 호출 함수 모음. vite 프록시로 /api → http://localhost:3001
// API 키 등 비밀값은 절대 여기에 두지 않는다.
import { trackRescheduling } from './rescheduling.js';

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  getUserSettings: () => request('/user/settings'),
  saveUserSettings: (settings) => trackRescheduling(request('/user/settings', { method: 'PATCH', body: { settings, confirmReschedule: true } })),
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
  estimateTask: (payload, { signal } = {}) => request('/tasks/estimate', { method: 'POST', body: payload, signal }),
  getTasks: () => request('/tasks'),
  createTask: (task) => trackRescheduling(request('/tasks', { method: 'POST', body: task })),
  // payload.reschedule === false면 기록만 저장하고 재배치는 나중에 reschedule()로 요청한다
  reportProgress: (taskId, payload) => {
    const sent = request(`/tasks/${taskId}/progress`, { method: 'PATCH', body: payload });
    return payload.reschedule === false ? sent : trackRescheduling(sent);
  },

  updateTask: (taskId, patch) => request(`/tasks/${taskId}`, { method: 'PATCH', body: patch }),
  deleteTask: (taskId) => request(`/tasks/${taskId}`, { method: 'DELETE' }),
  addSubtask: (taskId, subtask) => request(`/tasks/${taskId}/subtasks`, { method: 'POST', body: subtask }),
  updateSubtask: (taskId, subtaskId, patch) => request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'PATCH', body: patch }),
  deleteSubtask: (taskId, subtaskId) => request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE' }),

  updateFixedBlock: (id, patch) => request(`/schedule/fixed/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  postponeBlocks: (payload) => request('/schedule/blocks/postpone', { method: 'POST', body: payload }),
  deleteCalendarItem: (source, id, date) => request(`/schedule/items/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, { method: 'DELETE', body: { date } }),


  // 일정
  getTodaySchedule: () => request('/schedule/today'),
  getWeekSchedule: (from) => request(`/schedule/week?from=${encodeURIComponent(from)}`),
  reschedule: (reason = 'manual') => trackRescheduling(request('/schedule/reschedule', { method: 'POST', body: { reason } })),

  // 고정 일정(일정·루틴·알바). 저장·삭제 후 서버가 작업을 다시 배치한다
  getFixedBlocks: () => request('/fixed-blocks'),
  createFixedBlock: (block) => trackRescheduling(request('/fixed-blocks', { method: 'POST', body: block })),
  deleteFixedBlock: (id) => trackRescheduling(request(`/fixed-blocks/${id}`, { method: 'DELETE' })),
};
