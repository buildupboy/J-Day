import { useCallback, useEffect, useRef, useState } from 'react';

// 브라우저 지원 여부는 사용 시점에 확인한다
const getSpeechRecognition = () =>
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

/**
 * Web Speech API 음성 인식 훅 (크롬 기준, ko-KR).
 * TODO: "헤이 제이" 호출어 감지(continuous 모드) 추가
 * @param {{ lang?: string, onFinalResult?: (text: string) => void }} options
 */
export function useSpeechRecognition({ lang = 'ko-KR', onFinalResult } = {}) {
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinalResult);
  const lastInterimRef = useRef(''); // 종료 직전까지 들린 말
  const deliveredRef = useRef(false); // 이번 듣기에서 최종 결과를 이미 넘겼는지
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState(null);

  // 콜백이 바뀌어도 recognition 인스턴스를 다시 만들지 않도록 ref로 보관
  useEffect(() => {
    onFinalRef.current = onFinalResult;
  }, [onFinalResult]);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          if (text) {
            deliveredRef.current = true;
            lastInterimRef.current = '';
            onFinalRef.current?.(text);
          }
        } else {
          interim += text;
        }
      }
      if (interim) lastInterimRef.current = interim;
      setInterimTranscript(interim);
    };
    recognition.onerror = (event) => setError(event.error);
    recognition.onend = () => {
      // 말을 멈추거나 직접 종료했을 때 최종 결과 없이 끝나면 들린 부분까지 보낸다
      if (!deliveredRef.current && lastInterimRef.current) onFinalRef.current?.(lastInterimRef.current);
      lastInterimRef.current = '';
      setListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    lastInterimRef.current = '';
    deliveredRef.current = false;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      // 이미 듣는 중이면 InvalidStateError가 나므로 무시한다
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { supported: Boolean(getSpeechRecognition()), listening, interimTranscript, error, start, stop };
}
