import { useCallback, useEffect, useState } from 'react';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

function pickVoice(voices, lang) {
  const normalizedLang = lang.toLowerCase().replace(/_/g, '-');
  const language = normalizedLang.split('-')[0];
  const matching = voices.filter((voice) =>
    voice.lang.toLowerCase().replace(/_/g, '-').split('-')[0] === language
  );
  const score = (voice) =>
    (voice.localService ? 100 : 0) +
    (voice.localService && /microsoft/i.test(voice.name) ? 20 : 0) +
    (voice.lang.toLowerCase().replace(/_/g, '-') === normalizedLang ? 10 : 0) +
    (voice.default ? 1 : 0);
  return matching.sort((a, b) => score(b) - score(a))[0] ?? null;
}

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
    const updateVoice = () => {
      setVoice(pickVoice(synth.getVoices(), lang));
    };
    updateVoice();
    synth.addEventListener('voiceschanged', updateVoice);
    return () => synth.removeEventListener('voiceschanged', updateVoice);
  }, [lang]);

  const speak = useCallback(
    (text) => {
      if (!synth || !text) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      // 응답 직전에 목록을 다시 읽어 늦게 로드된 Windows 내장 음성도 반영한다.
      const currentVoice = pickVoice(synth.getVoices(), lang) ?? voice;
      if (currentVoice) utterance.voice = currentVoice;
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
