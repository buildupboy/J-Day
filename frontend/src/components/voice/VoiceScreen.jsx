import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { mockInterpret } from '../../data/mockInterpret.js';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition.js';
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis.js';
import { MicIcon, SparkIcon, ArrowRightIcon } from '../common/Icons.jsx';
import TaskProposalCard from './TaskProposalCard.jsx';
import jayImage from '../../assets/jay.webp';

const EXAMPLES = ['절반 했어', '오늘 뭐 있어?', '내일로 미뤄 줘'];
const BAR_COUNT = 31;

const ERROR_TEXT = {
  'not-allowed': '마이크 권한이 필요해요. 브라우저 설정에서 허용해 주세요.',
  'no-speech': '말소리가 들리지 않았어요. 다시 말해 주세요.',
};

// 마이크 탭을 누르면 뜨는 제이 화면: 말하는 중 / 대화 / 직접 입력
export default function VoiceScreen({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [text, setText] = useState('');
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

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => cancel, [cancel]);

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
    start();
  };

  // 말하는 중 화면
  if (listening) {
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
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 9) * 0.09}s` }} />
            ))}
          </div>
          <button type="button" className="big-mic is-listening" onClick={stop} aria-label="듣기 중지">
            <MicIcon size={30} />
          </button>
          <p className="example-title">이렇게 말해 보세요</p>
          <p className="example-line">{EXAMPLES.map((e) => `"${e}"`).join(' · ')}</p>
          <button type="button" className="to-keyboard" onClick={stop}>
            키보드로 입력할래요
          </button>
        </div>
      </div>
    );
  }

  const empty = messages.length === 0;

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
                    <SparkIcon size={18} />
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
            {thinking && (
              <li className="assistant-row">
                <span className="assistant-avatar">
                  <SparkIcon size={18} />
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
        {error && <p className="dock-error">{ERROR_TEXT[error] ?? `음성 인식 오류: ${error}`}</p>}
        {!supported && <p className="dock-error">이 브라우저는 음성 인식을 지원하지 않아요. 직접 입력해 주세요.</p>}
        <form className="dock-form" onSubmit={submitText}>
          <input
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
