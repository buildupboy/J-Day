import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { reminderTimes } from '../utils/reminder.js';

const POLL_MS = 30000;
const FIRED_KEY = 'jday-fired-reminders';
const MAX_LATE_MS = 6 * 3600000; // 앱을 늦게 열어도 이 시간 안의 알림만 보여 준다

const readFired = () => {
  try { return JSON.parse(localStorage.getItem(FIRED_KEY)) ?? []; } catch { return []; }
};
const writeFired = (keys) => {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(keys.slice(-200))); } catch { /* 저장 불가 환경이면 알림을 한 번 더 볼 수 있다 */ }
};

// 앱이 열려 있는 동안 알림 시각이 되면 브라우저 알림(허용 시)과 화면 안내를 띄운다
export default function useReminders() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      let tasks;
      try { tasks = await api.getTasks(); } catch { return; }
      if (stopped) return;
      const now = Date.now();
      const fired = readFired();
      for (const task of tasks) {
        if (task.status === 'done') continue;
        for (const at of reminderTimes(task)) {
          if (at > now || now - at > MAX_LATE_MS) continue;
          const key = `${task.id}:${at}`;
          if (fired.includes(key)) continue;
          fired.push(key);
          const body = `‘${task.title}’ 마감이 다가오고 있어요.`;
          setMessage(body);
          if ('Notification' in window && Notification.permission === 'granted') new Notification('제이', { body });
        }
      }
      writeFired(fired);
    };
    check();
    const timer = setInterval(check, POLL_MS);
    window.addEventListener('schedule-changed', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('schedule-changed', check);
    };
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  return message;
}
