import { useEffect, useState } from 'react';

const SILENCE = 0.012; // 이 아래는 소음으로 보고 무시 (RMS)
const GAIN = 9;

/**
 * 마이크 입력 크기를 읽어 파형용 막대 높이(0~1) 배열로 돌려준다.
 * 새 값이 오른쪽에서 들어오고 왼쪽으로 밀려나는 방식이라 말할 때만 물결이 생긴다.
 * 마이크를 열지 못하면 배열은 계속 0(평평)이다. onLevel은 매 측정마다 현재 크기를 알려 준다.
 */
export function useAudioLevel(active, barCount = 31, onLevel) {
  const [levels, setLevels] = useState(() => Array(barCount).fill(0));

  useEffect(() => {
    if (!active) {
      setLevels(Array(barCount).fill(0));
      return undefined;
    }

    let stopped = false;
    let stream;
    let context;
    let timer;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        context = new (window.AudioContext || window.webkitAudioContext)();
        if (context.state === 'suspended') await context.resume().catch(() => {});
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.fftSize);

        timer = setInterval(() => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (const v of buffer) {
            const d = (v - 128) / 128;
            sum += d * d;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const level = rms < SILENCE ? 0 : Math.min(1, (rms - SILENCE) * GAIN);
          onLevel?.(level);
          setLevels((prev) => [...prev.slice(1), level]);
        }, 40);
      } catch {
        // 마이크 권한이 없거나 열 수 없으면 평평한 파형으로 둔다
      }
    })();

    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      context?.close();
    };
  }, [active, barCount]);

  return levels;
}
