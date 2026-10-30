import { useCallback, useEffect, useRef, useState } from 'react';
import jayImage from '../assets/jay.webp';

const SIZE = 360;

// 제이 캐릭터를 캔버스에서 움직이는 영상으로 그려 <video>로 재생하고, 그 video를 PiP(떠 있는 창)로 띄운다.
// 영상 파일이 생기면 이 훅 없이 <video src>에 연결해도 PiP 버튼 로직(toggle)은 그대로 쓸 수 있다.
export default function useCharacterPip({ active = false } = {}) {
  const videoRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [inPip, setInPip] = useState(false);
  const [pipError, setPipError] = useState(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !HTMLCanvasElement.prototype.captureStream) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = jayImage;
    let raf;
    let stopped = false;
    const t0 = performance.now();

    const draw = (now) => {
      if (stopped) return;
      const t = (now - t0) / 1000;
      ctx.fillStyle = '#fefefe'; // 캐릭터 이미지 배경색과 같게 해서 네모 테두리가 보이지 않게 한다
      ctx.fillRect(0, 0, SIZE, SIZE);
      if (activeRef.current) {
        // 듣는 중에는 퍼지는 링으로 알려 준다
        const r = 120 + ((t * 60) % 50);
        ctx.strokeStyle = `rgba(61,92,245,${1 - ((t * 60) % 50) / 50})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (img.complete && img.naturalWidth) {
        const bob = Math.sin(t * 2.4) * 6;
        const scale = 1 + Math.sin(t * 2.4) * 0.015;
        const w = 330 * scale;
        const h = (img.naturalHeight / img.naturalWidth) * w;
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2 + bob, w, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    el.srcObject = canvas.captureStream(30);
    el.muted = true;
    el.playsInline = true;
    el.play().catch(() => {});

    const enter = () => setInPip(true);
    const leave = () => setInPip(false);
    const webkitChange = () => setInPip(el.webkitPresentationMode === 'picture-in-picture');
    el.addEventListener('enterpictureinpicture', enter);
    el.addEventListener('leavepictureinpicture', leave);
    el.addEventListener('webkitpresentationmodechanged', webkitChange);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      el.removeEventListener('enterpictureinpicture', enter);
      el.removeEventListener('leavepictureinpicture', leave);
      el.removeEventListener('webkitpresentationmodechanged', webkitChange);
      el.srcObject?.getTracks().forEach((track) => track.stop());
      el.srcObject = null;
    };
  }, []);

  const toggle = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    setPipError(null);
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && el.requestPictureInPicture) {
        if (el.paused) await el.play();
        await el.requestPictureInPicture();
      } else if (el.webkitSetPresentationMode) {
        el.webkitSetPresentationMode(el.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
      } else {
        setPipError('이 브라우저는 작은 창(PiP)을 지원하지 않아요. 크롬이나 사파리로 열어 주세요.');
      }
    } catch (error) {
      setPipError(`작은 창을 띄우지 못했어요. (${error.name})`);
    }
  }, []);

  return { videoRef, pipError, inPip, toggle };
}
