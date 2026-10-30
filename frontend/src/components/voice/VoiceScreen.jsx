import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';
import { useAudioLevel } from '../../hooks/useAudioLevel.js';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition.js';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis.js';
import useCharacterPip from '../../hooks/useCharacterPip.js';
import { loadThread, saveThread } from '../../utils/chatEntry.js';
import {
  MicIcon,
  ArrowRightIcon,
  KeyboardIcon,
  CloseIcon,
  SpeakerLoudIcon,
  SpeakerIcon,
  ListIcon,
  StopIcon,
  PipIcon,
} from '../common/Icons.jsx';
import TaskProposalCard from './TaskProposalCard.jsx';

const EXAMPLES = ['오늘 뭐 있어?', '절반 했어', '내일로 미뤄 줘'];
const BAR_COUNT = 7;
const SILENCE_LIMIT_MS = 5000; // 이 시간 동안 말이 없으면 듣기를 끝내고 제이에게 보낸다

const ERROR_TEXT = {
  'not-allowed': '마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요.',
  'start-failed': '마이크를 시작하지 못했어요. 다시 눌러 주세요.',
  'no-speech': '말소리가 들리지 않았어요. 다시 말해 주세요.',
  'audio-capture': '마이크를 찾지 못했거나 다른 앱이 쓰고 있어요. 마이크 연결과 설정을 확인해 주세요.',
  network: '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
  'service-not-allowed': '이 브라우저에서는 음성 인식을 쓸 수 없어요. 크롬에서 열어 주세요.',
};

// 04 제이 대화: 마이크 탭을 누르면 바로 듣고, 대화와 등록 결과를 한 화면에 보여 준다.
// needsStart: 알림·PiP로 돌아온 경우. iOS 제약 때문에 사용자가 '대화 시작'을 한 번 눌러야 마이크를 켠다.
export default function VoiceScreen({ nav, onClose, needsStart = false }) {
  const [started, setStarted] = useState(!needsStart);
  const [messages, setMessages] = useState(loadThread);
  useEffect(() => saveThread(messages), [messages]);
  const [thinking, setThinking] = useState(false);
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    setLongWait(false);
    if (!thinking) return;
    const timer = setTimeout(() => setLongWait(true), 10000);
    return () => clearTimeout(timer);
  }, [thinking]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [muted, setMuted] = useState(false);
  const threadRef = useRef(null);
  const sendingRef = useRef(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const { speak, cancel } = useSpeechSynthesis();
  const { videoRef, pipError, inPip, toggle: togglePip } = useCharacterPip();

  // 저장은 끝났고 서버가 뒤에서 일정을 배치하는 중이면, 끝날 때까지 기다렸다가 화면을 새로 고친다.
  const watchScheduling = () => {
    api.waitForScheduling()
      .then((status) => {
        scheduleChanged();
        if (status.error) {
          setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', isError: true, retryScheduling: true,
            text: `저장은 됐지만 일정을 배치하지 못했어요. (${status.error})` }]);
        }
      })
      .catch((error) => {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', isError: true, retryScheduling: true, text: `일정 배치 상태를 확인하지 못했어요. ${error.message}` }]);
      });
  };
  const retryScheduling = async () => {
    try { await api.runScheduler(); watchScheduling(); } catch (error) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', isError: true, text: `다시 배치하지 못했어요. ${error.message}` }]);
    }
  };

  const send = async (raw, viaVoice = false, retry = null) => {
    const content = raw.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    const command = retry ?? {
      requestId: crypto.randomUUID(),
      conversation: messages
        .filter((m) => !m.isError)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text })),
    };
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: content }]);
    setThinking(true);

    try {
      const res = await api.interpret(content, command);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: res.reply,
          task: ['add_task', 'update_task'].includes(res.intent) || res.result?.cardMode === 'existing' ? res.result?.task ?? null : null,
          // 한 발화에 여러 작업을 등록한 경우: 저장한 카드 여러 개 + 이미 있던 과제 카드
          tasks: res.result?.tasks?.length > 1 ? res.result.tasks : null,
          duplicates: res.result?.duplicates?.length ? res.result.duplicates : null,
          quickReplies: res.result?.quickReplies?.length ? res.result.quickReplies : null,
          cardMode: res.result?.cardMode,
          updated: res.intent === 'update_task',
          status: res.status,
        },
      ]);
      if (res.status === 'scheduled' || res.status === 'pending_schedule') scheduleChanged();
      if (res.schedulingInBackground) watchScheduling();
      if (viaVoice && !mutedRef.current) speak(res.reply.replace(/\n/g, ' '));
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `처리하지 못했어요. ${error.message}`,
          isError: true,
          retry: { content, command },
        },
      ]);
    } finally {
      setThinking(false);
      sendingRef.current = false;
    }
  };

  const { supported, listening, hearing, audioStarted, interimTranscript, error, start, stop } = useSpeechRecognition({
    onFinalResult: (t) => send(t, true),
  });

  const lastActivityRef = useRef(Date.now());
  const hearingRef = useRef(false);
  hearingRef.current = hearing;

  // 입력창 옆 작은 파형용 마이크 레벨. 인식기가 마이크를 먼저 잡은 뒤에 읽기 시작한다
  const { levels, ready: meterReady } = useAudioLevel(audioStarted && listening && !typing, BAR_COUNT, (level) => {
    if (level > 0) lastActivityRef.current = Date.now();
  });

  useEffect(() => {
    if (hearing || interimTranscript) lastActivityRef.current = Date.now();
  }, [hearing, interimTranscript]);

  // 듣는 동안 조용한 시간이 5초를 넘으면 자동 종료 → 들린 말은 훅이 제이에게 넘긴다
  useEffect(() => {
    if (!listening || typing) return undefined;
    lastActivityRef.current = Date.now();
    const t = setInterval(() => {
      if (hearingRef.current) lastActivityRef.current = Date.now();
      else if (Date.now() - lastActivityRef.current >= SILENCE_LIMIT_MS) stop();
    }, 500);
    return () => clearInterval(t);
  }, [listening, typing, stop]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => cancel, [cancel]);

  // 시작하면 바로 듣기 시작한다. 앱이 전면에 올 때까지 기다린 뒤 마이크를 켠다.
  // setTimeout은 StrictMode의 이중 실행 방지용
  useEffect(() => {
    if (!supported || !started) return undefined;
    let t;
    const go = () => { t = setTimeout(start, 0); };
    if (document.hidden) {
      const onVisible = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', onVisible); go(); } };
      document.addEventListener('visibilitychange', onVisible);
      return () => document.removeEventListener('visibilitychange', onVisible);
    }
    go();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, started]);

  const submitText = (e) => {
    e.preventDefault();
    send(text);
    setText('');
  };

  const toggleMic = () => {
    if (listening) {
      stop();
      return;
    }
    cancel();
    setTyping(false);
    start();
  };

  const startConversation = () => {
    setStarted(true);
  };

  const status = !started ? '대화 준비 중' : listening ? '듣고 있어요' : thinking ? '생각하는 중이에요' : '대기 중';
  const empty = messages.length === 0 && !thinking;

  return (
    <div className="voice">
      <header className="voice-bar">
        <button type="button" className="d-icon-btn" onClick={onClose} aria-label="닫기">
          <CloseIcon size={20} />
        </button>
        <div className="voice-who">
          <video ref={videoRef} className="jay-video" muted playsInline aria-label="제이 캐릭터" />
          <p className="voice-name">제이</p>
          <p className={`voice-status ${listening ? 'is-live' : ''}`}>
            <i aria-hidden="true" />
            {status}
          </p>
        </div>
        <div className="voice-actions">
        <button
          type="button"
          className="d-icon-btn"
          aria-label={muted ? '음성 응답 켜기' : '음성 응답 끄기'}
          aria-pressed={muted}
          onClick={() => {
            setMuted((m) => !m);
            cancel();
          }}
        >
          {muted ? <SpeakerIcon size={20} /> : <SpeakerLoudIcon size={20} />}
        </button>
        {(
          <button
            type="button"
            className="d-icon-btn"
            aria-label={inPip ? '떠 있는 제이 닫기' : '제이를 작은 창으로 띄우기'}
            aria-pressed={inPip}
            onClick={togglePip}
          >
            <PipIcon size={20} />
          </button>
        )}
        </div>
      </header>

      {pipError && <p className="d-error" role="alert" style={{ padding: '0 16px' }}>{pipError}</p>}
      <section className="voice-thread" ref={threadRef} aria-label="대화">
        {empty ? (
          <div className="voice-idle">
            <h1>헤이 제이,</h1>
            <p>무엇을 도와드릴까요?</p>
            <p className="d-meta">“12월 3일까지 빅데이터 보고서, 8시간쯤 걸려”처럼 말해 보세요.</p>
            <div className="chip-row">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="chip" onClick={() => send(e)}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="thread-list">
            {messages.map((m, index) =>
              m.role === 'user' ? (
                <li key={m.id} className="bubble-user">
                  {m.text}
                </li>
              ) : (
                <li key={m.id} className="assistant-col">
                  <p className={`bubble-assistant ${m.isError ? 'is-error' : ''}`}>{m.text}</p>
                  {m.retry && (
                    <button
                      type="button"
                      className="chip"
                      disabled={thinking}
                      onClick={() => send(m.retry.content, false, m.retry.command)}
                    >
                      다시 시도
                    </button>
                  )}
                  {m.retryScheduling && (
                    <button type="button" className="chip" onClick={retryScheduling}>
                      다시 배치
                    </button>
                  )}
                  {(m.tasks ?? (m.task &&!(m.duplicates && m.cardMode === 'existing') ? [m.task] : [])).map((task) => (
                    <TaskProposalCard
                      key={task.id}
                      task={task}
                      status={m.status}
                      cardMode={m.cardMode}
                      updated={m.updated}
                      onOpenCalendar={() => nav.tab('calendar')}
                      onOpenList={() => nav.tab('tasks', 'upcoming')}
                    />
                  ))}
                  {m.quickReplies && index === messages.length - 1 && !thinking && (
                    <div className="chip-row">
                      {m.quickReplies.map((reply) => (
                        <button key={reply} type="button" className="chip" onClick={() => send(reply)}>
                          {reply}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.duplicates?.map((task) => (
                    <TaskProposalCard
                      key={`dup-${task.id}`}
                      task={task}
                      cardMode="existing"
                      onOpenCalendar={() => nav.tab('calendar')}
                      onOpenList={() => nav.tab('tasks', 'upcoming')}
                    />
                  ))}
                </li>
              )
            )}
            {thinking && longWait && <li className="assistant-col" role="status"><p className="bubble-assistant">기존 일정과 휴식 시간을 함께 검토하고 있어요. 잠시만 기다려 주세요.</p></li>}
            {thinking && (
              <li className="assistant-col">
                <p className="bubble-assistant typing" aria-label="제이가 답을 준비하는 중">
                  <i />
                  <i />
                  <i />
                </p>
              </li>
            )}
          </ul>
        )}
      </section>

      {!started ? (
        <footer className="voice-foot voice-gate">
          <p className="d-meta">제이가 기다리고 있어요. 버튼을 누르면 마이크가 켜져요.</p>
          <button type="button" className="gate-btn" onClick={startConversation}>
            <MicIcon size={22} /> 대화 시작
          </button>
        </footer>
      ) : (
      <footer className="voice-foot">
        {error && !typing && <p className="d-error">{ERROR_TEXT[error] ?? `음성 인식 오류: ${error}`}</p>}
        {!supported && <p className="d-error">이 브라우저는 음성 인식을 지원하지 않아요. 직접 입력해 주세요.</p>}
        {typing || !supported ? (
          <form className="voice-input" onSubmit={submitText}>
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="제이에게 메시지 보내기"
              aria-label="제이에게 보낼 메시지"
            />
            <button type="submit" className="voice-send" disabled={!text.trim() || thinking} aria-label="보내기">
              <ArrowRightIcon size={18} />
            </button>
          </form>
        ) : (
          <div className="voice-input" aria-live="polite">
            <span className={`mini-wave ${listening ? 'is-live' : ''}`} aria-hidden="true">
              {Array.from({ length: BAR_COUNT }, (_, i) => (
                <i key={i} style={meterReady ? { height: 3 + levels[i] * 16 } : { animationDelay: `${i * 0.1}s` }} />
              ))}
            </span>
            <p>{interimTranscript ? `${interimTranscript}…` : listening ? '말씀해 주세요' : '마이크를 눌러 말해 보세요'}</p>
          </div>
        )}
        <div className="voice-controls">
          <button
            type="button"
            className="round-btn"
            aria-label={typing ? '말로 입력' : '텍스트로 입력'}
            aria-pressed={typing}
            onClick={() => {
              if (!typing && listening) stop();
              setTyping((t) => !t);
            }}
          >
            {typing ? <MicIcon size={20} /> : <KeyboardIcon size={20} />}
          </button>
          <button
            type="button"
            className={`big-mic ${listening ? 'is-listening' : ''}`}
            onClick={toggleMic}
            disabled={!supported || thinking}
            aria-label={listening ? '말하기 멈추기' : '말하기'}
          >
            {listening ? <StopIcon size={24} /> : <MicIcon size={28} />}
          </button>
          <button type="button" className="round-btn" aria-label="일정 목록 보기" onClick={() => nav.tab('tasks', 'upcoming')}>
            <ListIcon size={20} />
          </button>
        </div>
      </footer>
      )}
    </div>
  );
}
