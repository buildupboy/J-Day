import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { mockInterpret } from '../../data/mockInterpret.js';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition.js';
import { useAudioLevel } from '../../hooks/useAudioLevel.js';
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
  'no-speech':'말소리가 들리지 않았어요. 다시 말해 주세요.',
};

// 마이크 탭을 누르면 뜨는 제이 화면: 말하는 중 / 대화 / 직접 입력
export default function VoiceScreen({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false); // 키보드 버튼으로 넘어온 경우 입력창에 바로 포커스
  const threadRef = useRef(null);
  const { speak, cancel } = useSpeechSynthesis();

  const send = async (raw, viaVoice = false) => {
    const content = raw.trim();
    if (!content) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: content }]);
    setThinking(true);

    let res;
    try {
      res = await api.interpret(content);
    } catch {
      res = await mockInterpret(content); // 백엔드 미구현 동안 시연용
    }

    setThinking(false);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', text: res.reply, task: res.result?.task ?? null, added: false },
    ]);
    if (viaVoice) speak(res.reply.replace(/\n/g, ' '));
  };

  const { supported, listening, interimTranscript, error, start, stop } = useSpeechRecognition({
    onFinalResult: (t) => send(t, true),
  });

  const lastActivityRef = useRef(Date.now());
  // 마이크를 다시 눌러 끝낸 직후. 인식기가 마무리되기를 기다리는 동안에도 바로 답변 화면을 보여 준다
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    if (!listening) setStopping(false);
  }, [listening]);

  const endListening = () => {
    setStopping(true);
    stop();
  };

  const levels = useAudioLevel(listening && !typing && !stopping, BAR_COUNT, (level) => {
    if (level > 0) lastActivityRef.current = Date.now();
  });

  // 인식된 글자가 바뀌면 말하는 중으로 본다
  useEffect(() => {
    if (interimTranscript) lastActivityRef.current = Date.now();
  }, [interimTranscript]);

  // 듣는 동안 조용한 시간이 5초를 넘으면 자동 종료 → 들린 말은 훅이 제이에게 넘긴다
  useEffect(() => {
    if (!listening || typing) return undefined;
    lastActivityRef.current = Date.now();
    const t = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= SILENCE_LIMIT_MS) stop();
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

  const addTask = async (m) => {
    // TODO: 백엔드 POST /api/tasks 구현 후 실패 처리. 지금은 화면에서만 추가 상태로 바꾼다.
    await api.createTask(m.task).catch(() => null);
    updateMessage(m.id, { added: true });
  };

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
          <div className="waveform" aria-hidden="true">
            {levels.map((lv, i) => (
              <i key={i} style={{ height: 4 + lv * 44 }} />
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
                    {m.task && (
                      <TaskProposalCard
                        task={m.task}
                        added={m.added}
                        onChange={(task) => updateMessage(m.id, { task })}
                        onAdd={() => addTask(m)}
                      />
                    )}
                  </div>
                </li>
              )
            )}
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
            disabled={!supported}
            aria-label="말하기"
          >
            <MicIcon size={22} />
          </button>
        </form>
      </div>
    </div>
  );
}
