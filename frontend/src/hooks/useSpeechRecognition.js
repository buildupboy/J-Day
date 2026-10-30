import { useCallback, useEffect, useRef, useState } from 'react';

// 브라우저 지원 여부는 사용 시점에 확인한다
const getSpeechRecognition = () =>
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

// stop() 뒤 이 시간 안에 onend가 안 오면 직접 끝낸다
const FORCE_END_MS = 1200;

/**
 * Web Speech API 음성 인식 훅 (크롬 기준, ko-KR).
 * 듣기를 시작할 때마다 새 인식기를 만든다. 인식기를 재사용하면 직전 세션이 덜 끝난 상태에서
 * start()가 InvalidStateError로 거부되는 일이 있어서다.
 * TODO: "헤이 제이" 호출어 감지(continuous 모드) 추가
 * @param {{ lang?: string, onFinalResult?: (text: string) => void }} options
 */
export function useSpeechRecognition({ lang = 'ko-KR', onFinalResult } = {}) {
  const recRef = useRef(null); // 지금 듣고 있는 세션의 인식기 (없으면 null)
  const onFinalRef = useRef(onFinalResult);
  const lastInterimRef = useRef(''); // 종료 직전까지 들린 말
  const deliveredRef = useRef(false); // 이번 듣기에서 최종 결과를 이미 넘겼는지
  const forceTimerRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState(null);

  // 콜백이 바뀌어도 세션을 다시 만들지 않도록 ref로 보관
  useEffect(() => {
    onFinalRef.current = onFinalResult;
  }, [onFinalResult]);

  // 세션을 마무리한다. 같은 세션에 대해 여러 번 불려도 한 번만 실행되고,
  // 이미 끝난 지난 세션의 늦은 이벤트는 무시한다.
  const finish = useCallback((rec) => {
    if (rec !== recRef.current) return;
    recRef.current = null;
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

  const start = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    // 아직 정리 중인 이전 세션이 있으면 먼저 끝낸다
    const old = recRef.current;
    if (old) {
      try {
        old.abort();
      } catch {
        // 이미 끝난 인식기면 무시
      }
      finish(old);
    }

    const rec = new SpeechRecognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;

    rec.onresult = (event) => {
      if (rec !== recRef.current) return;
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
    rec.onerror = (event) => {
      if (rec !== recRef.current) return;
      if (event.error !== 'aborted') setError(event.error);
    };
    rec.onend = () => finish(rec);

    setError(null);
    lastInterimRef.current = '';
    deliveredRef.current = false;
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setError('start-failed');
      finish(rec);
    }
  }, [lang, finish]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // 이미 끝난 인식기면 무시
    }
    // 브라우저가 onend를 늦게 주거나 안 줘도 화면이 듣기 상태에 갇히지 않게 한다
    clearTimeout(forceTimerRef.current);
    forceTimerRef.current = setTimeout(() => {
      try {
        rec.abort();
      } catch {
        // 이미 끝난 인식기면 무시
      }
      finish(rec);
    }, FORCE_END_MS);
  }, [finish]);

  // 화면이 사라질 때 듣고 있던 세션을 정리한다
  useEffect(
    () => () => {
      clearTimeout(forceTimerRef.current);
      const rec = recRef.current;
      recRef.current = null;
      try {
        rec?.abort();
      } catch {
        // 이미 끝난 인식기면 무시
      }
    },
    []
  );

  return { supported: Boolean(getSpeechRecognition()), listening, interimTranscript, error, start, stop };
}
