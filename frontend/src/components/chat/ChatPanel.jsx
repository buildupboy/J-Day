import { useState } from 'react';
import MessageList from './MessageList.jsx';
import MicButton from '../common/MicButton.jsx';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition.js';

export default function ChatPanel() {
  const [messages, setMessages] = useState([
    { id: 'welcome', role: 'assistant', text: '안녕하세요, 제이예요. 마이크를 누르고 말해 보세요.' },
  ]);

  const addUserMessage = (text) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text }]);
    // TODO: api.interpret(text) 호출 → 제이 응답 추가 + useSpeechSynthesis로 읽어주기
  };

  const { supported, listening, interimTranscript, error, start, stop } = useSpeechRecognition({
    onFinalResult: addUserMessage,
  });

  return (
    <div className="chat">
      <MessageList messages={messages} interim={interimTranscript} />
      <div className="chat-controls">
        {error && <span className="chat-error">음성 인식 오류: {error}</span>}
        {!supported && <span className="chat-error">이 브라우저는 음성 인식을 지원하지 않아요 (크롬 권장).</span>}
        <MicButton listening={listening} disabled={!supported} onClick={listening ? stop : start} />
      </div>
    </div>
  );
}
