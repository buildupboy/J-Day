import { useCallback, useEffect, useRef, useState } from 'react';

// 브라우저 지원 여부는 사용 시점에 확인한다
const getSpeechRecognition = () =>
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

// stop() 뒤 이 시간 안에 onend가 안 오면 직접 끝낸다
const FORCE_END_MS = 1200;

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
  const endedRef = useRef(true); // 이번 듣기를 이미 마무리했는지
  const forceTimerRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState(null);

  // 콜백이 바뀌어도 recognition 인스턴스를 다시 만들지 않도록 ref로 보관
  useEffect(() => {
    onFinalRef.current = onFinalResult;
  }, [onFinalResult]);

  // 듣기를 마무리한다. onend와 강제 종료 타이머가 둘 다 불러도 한 번만 실행된다.
  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearTimeout(forceTimerRef.current);

    if (!deliveredRef.current && lastInterimRef.current) {
      // 최종 결과 없이 끝나면 들린 부분까지 보낸다
      deliveredRef.current = true;
      onFinalRef.current?.(lastInterimRef.current);
    } else if (!deliveredRef.current) {
      setError((prev) => prev ?? 'no-speech');
    }
    lastInterimRef.current = '';
    setListening(false);
    setInterimTranscript('');
  }, []);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return undefined;
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
    // 우리가 abort()한 경우의 'aborted'는 오류로 보지 않는다
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') setError(event.error);
    };
    recognition.onend = finish;

    recognitionRef.current = recognition;
    return () => recognition.abort();
  }, [lang, finish]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    lastInterimRef.current = '';
    deliveredRef.current = false;
    clearTimeout(forceTimerRef.current);
    // 화면은 바로 듣기 상태로 바꾸고, 직전 인식이 아직 정리 중이라 start()가 실패하면 잠시 뒤 다시 시도한다
    endedRef.current = false;
    setListening(true);
    const attempt = (retriesLeft) => {
      try {
        recognitionRef.current.start();
      } catch {
        if (retriesLeft > 0) {
          recognitionRef.current.abort();
          setTimeout(() => attempt(retriesLeft - 1), 300);
        } else {
          setError('start-failed');
          finish();
        }
      }
    };
    attempt(3);
  }, [finish]);

  const stop = useCallback(() => {
    if (endedRef.current) return;
    recognitionRef.current?.stop();
    // 브라우저가 onend를 늦게 주거나 안 줘도 화면이 듣기 상태에 갇히지 않게 한다
    clearTimeout(forceTimerRef.current);
    forceTimerRef.current = setTimeout(() => {
      recognitionRef.current?.abort();
      finish();
    }, FORCE_END_MS);
  }, [finish]);

  return { supported: Boolean(getSpeechRecognition()), listening, interimTranscript, error, start, stop };
}
