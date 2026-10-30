import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { scheduleChanged } from '../../hooks/useLiveSchedule.js';
import { useAudioLevel } from '../../hooks/useAudioLevel.js';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition.js';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis.js';
import { MicIcon, ArrowRightIcon, KeyboardIcon } from '../common/Icons.jsx';
import TaskProposalCard from './TaskProposalCard.jsx';
import jayImage from '../../assets/jay.webp';

const EXAMPLES = ['절반 했어', '오늘 뭐 있어?', '내일로 미뤄 줘'];
const BAR_COUNT = 31;
const SILENCE_LIMIT_MS = 5000; // 이 시간 동안 말이 없으면 듣기를 끝내고 제이에게 보낸다

const ERROR_TEXT = {
  'not-allowed': '마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요.',
  'start-failed': '마이크를 시작하지 못했어요. 다시 눌러 주세요.',
  'no-speech': '말소리가 들리지 않았어요. 다시 말해 주세요.',
  'audio-capture': '마이크를 찾지 못했거나 다른 앱이 쓰고 있어요. 마이크 연결과 설정을 확인해 주세요.',
  network: '음성 인식 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
  'service-not-allowed': '이 브라우저에서는 음성 인식을 쓸 수 없어요. 크롬에서 열어 주세요.',
};

// 마이크 탭을 누르면 뜨는 제이 화면: 말하는 중 / 대화 / 직접 입력
export default function VoiceScreen({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [longWait, setLongWait] = useState(false);
  useEffect(() => {
    setLongWait(false);
    if (!thinking) return;
    const timer = setTimeout(() => setLongWait(true), 10000);
    return () => clearTimeout(timer);
  }, [thinking]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false); // 키보드 버튼으로 넘어온 경우 입력창에 바로 포커스
  const threadRef = useRef(null);
  const sendingRef = useRef(false);
  const { speak, cancel } = useSpeechSynthesis();

  const send = async (raw, viaVoice = false, retry = null) => {
    const content = raw.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    const command = retry ?? { requestId: crypto.randomUUID(), conversation: messages.filter(m => !m.isError).slice(-12).map(m => ({ role: m.role, content: m.text })) };
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: content }]);
    setThinking(true);

    try {
      const res = await api.interpret(content, command);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: res.reply,
        task: ['add_task', 'update_task'].includes(res.intent) || res.result?.cardMode === 'existing' ? res.result?.task ?? null : null,
        cardMode: res.result?.cardMode, updated: res.intent === 'update_task', added: true, status: res.status }]);
      if (res.status === 'scheduled' || res.status === 'pending_schedule') scheduleChanged();
      if (viaVoice) speak(res.reply.replace(/\n/g, ' '));
    } catch (error) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant',
        text: `처리하지 못했어요. ${error.message}`, isError: true, retry: { content, command } }]);
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
  // 마이크를 다시 눌러 끝낸 직후. 인식기가 마무리되기를 기다리는 동안에도 바로 답변 화면을 보여 준다
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!listening) setStopping(false);
  }, [listening]);

  const endListening = () => {
    setStopping(true);
    stop();
  };

  // 파형용 마이크 레벨. 인식기가 마이크를 먼저 잡은 뒤에 읽기 시작해서 서로 방해하지 않게 한다
  const { levels, ready: meterReady } = useAudioLevel(
    audioStarted && listening && !typing && !stopping,
    BAR_COUNT,
    (level) => {
      if (level > 0) lastActivityRef.current = Date.now();
    }
  );

  // 소리가 들리거나 인식된 글자가 바뀌면 말하는 중으로 본다
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

  // 마이크 탭을 누르면 바로 듣기 시작한다. setTimeout은 StrictMode의 이중 실행 방지용
  useEffect(() => {
    if (!supported) return undefined;
    const t = setTimeout(start, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  const updateMessage = (id, patch) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const submitText = (e) => {
    e.preventDefault();
    send(text);
    setText('');
  };

  const startListening = () => {
    cancel();
    setTyping(false);
    start();
  };

  // 말하는 중 화면. 키보드 버튼을 누르면 듣기 종료를 기다리지 않고 바로 채팅 화면으로 넘어간다
  if (listening && !typing && !stopping) {
    return (
      <div className="voice">
        <button type="button" className="icon-button voice-close" onClick={onClose} aria-label="닫기">
          ✕
        </button>
        <div className="listen-body">
          <p className="listen-status">
            <i /> 듣고 있어요
          </p>
          <h1 className="listen-transcript">
            {interimTranscript ? (
              <>
                {interimTranscript}
                <span className="caret" />
              </>
            ) : (
              <span className="listen-placeholder">말씀해 주세요</span>
            )}
          </h1>
        </div>

        <div className="listen-foot">
          <div className={`waveform ${!meterReady && hearing ? 'is-live' : ''}`} aria-hidden="true">
            {meterReady
              ? levels.map((lv, i) => <i key={i} style={{ height: 4 + lv * 44 }} />)
              : Array.from({ length: BAR_COUNT }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${(i % 9) * 0.09}s` }} />
                ))}
          </div>
          <div className="mic-row">
            <button
              type="button"
              className="keyboard-button"
              onClick={() => {
                setTyping(true);
                stop();
              }}
              aria-label="키보드로 입력"
            >
              <KeyboardIcon size={26} />
            </button>
            <button type="button" className="big-mic is-listening" onClick={endListening} aria-label="듣기 중지">
              <MicIcon size={30} />
            </button>
            <span />
          </div>
          <p className="example-title">이렇게 말해 보세요</p>
          <p className="example-line">{EXAMPLES.map((e) => `"${e}"`).join(' · ')}</p>
        </div>
      </div>
    );
  }

  const empty = messages.length === 0 && !thinking && !stopping;

  return (
    <div className="voice">
      <button type="button" className="icon-button voice-close" onClick={onClose} aria-label="닫기">
        ✕
      </button>

      <div className="voice-thread" ref={threadRef}>
        {empty ? (
          <div className="voice-idle">
            <img src={jayImage} alt="제이" className="jay-image" />
            <h1>헤이 제이,</h1>
            <p>무엇을 도와드릴까요?</p>
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
            {messages.map((m) =>
              m.role === 'user' ? (
                <li key={m.id} className="bubble-user">
                  {m.text}
                </li>
              ) : (
                <li key={m.id} className="assistant-row">
                  <span className="assistant-avatar">
                    <img src={jayImage} alt="제이" />
                  </span>
                  <div className="assistant-col">
                    <p className="bubble-assistant">{m.text}</p>
                    {m.retry && <button type="button" className="chip" disabled={thinking} onClick={() => send(m.retry.content, false, m.retry.command)}>다시 시도</button>}
                    {m.task && (
                      <TaskProposalCard
                        task={m.task}
                        added={m.added}
                        cardMode={m.cardMode}
                        updated={m.updated}
                        status={m.status}
                        onChange={(task) => updateMessage(m.id, { task })}
                      />
                    )}
                  </div>
                </li>
              )
            )}
            {thinking && longWait && <li className="assistant-row" role="status"><p className="bubble-assistant">기존 일정과 휴식 시간을 함께 검토하고 있어요. 잠시만 기다려 주세요.</p></li>}
            {(thinking || stopping) && (
              <li className="assistant-row">
                <span className="assistant-avatar">
                  <img src={jayImage} alt="제이" />
                </span>
                <p className="bubble-assistant typing">
                  <i />
                  <i />
                  <i />
                </p>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="voice-dock">
        {error && !typing && <p className="dock-error">{ERROR_TEXT[error] ?? `음성 인식 오류: ${error}`}</p>}
        {!supported && <p className="dock-error">이 브라우저는 음성 인식을 지원하지 않아요. 직접 입력해 주세요.</p>}
        <form className="dock-form" onSubmit={submitText}>
          <input
            autoFocus={typing}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="제이에게 메시지 보내기"
            aria-label="제이에게 보낼 메시지"
          />
          <button type="submit" className="dock-send" disabled={!text.trim() || thinking} aria-label="보내기">
            <ArrowRightIcon size={20} />
          </button>
          <button
            type="button"
            className="dock-mic"
            onClick={startListening}
            disabled={!supported || thinking}
            aria-label="말하기"
          >
            <MicIcon size={22} />
          </button>
        </form>
      </div>
    </div>
  );
}
