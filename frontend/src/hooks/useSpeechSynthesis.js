import { useCallback, useEffect, useState } from 'react';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

/**
 * Web Speech API 음성 합성 훅 (ko-KR). 제이의 응답을 읽어줄 때 사용.
 * @param {{ lang?: string, rate?: number }} options
 */
export function useSpeechSynthesis({ lang = 'ko-KR', rate = 1 } = {}) {
  const [voice, setVoice] = useState(null);
  const [speaking, setSpeaking] = useState(false);

  // 크롬은 목소리 목록을 비동기로 불러오므로 voiceschanged 이벤트를 기다린다
  useEffect(() => {
    if (!synth) return;
    const pickVoice = () => {
      const voices = synth.getVoices();
      setVoice(voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.startsWith('ko')) || null);
    };
    pickVoice();
    synth.addEventListener('voiceschanged', pickVoice);
    return () => synth.removeEventListener('voiceschanged', pickVoice);
  }, [lang]);

  const speak = useCallback(
    (text) => {
      if (!synth || !text) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [lang, rate, voice]
  );

  const cancel = useCallback(() => {
    synth?.cancel();
    setSpeaking(false);
  }, []);

  return { supported: Boolean(synth), speaking, speak, cancel };
}
