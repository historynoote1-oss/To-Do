// ===== الغرف الصوتية — مشغّل الصوت المخفي المتزامن =====
// كل عضو داخل الغرفة عنده نسخته الخاصة من المشغّل ده (مش مشغّل واحد
// مشترك)، لكن كل النسخ بتشتغل على نفس المقطع وبتتزامن على نفس اللحظة
// تقريبًا (بالاعتماد على startedAtMs اللي جاي من السيرفر) — بالظبط زي فكرة
// "بث" فيه بوت افتراضي بيشغّل عند كل الناس براحتهم. الصوت والتحكم فيه
// (رفع/خفض) محلي بحت لكل عضو، مش متزامن مع حد.
//
// المتصفحات بتمنع تشغيل صوت (غير مكتوم) تلقائيًا من غير تفاعل مباشر من
// المستخدم، فبنبدأ التشغيل مكتوم دايمًا وبنعرض تنبيه واضح "دوس عشان تسمع"
// — أول تفاعل من المستخدم (دوسة واحدة) بيلغي الكتم ويعيد الضبط على نفس
// اللحظة الصحيحة من التلاوة.

import { useEffect, useRef, useState } from 'react';
import type { VoiceRoomPlayback } from '@/hooks/voiceRoomSocket';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const CONTAINER_ID = 'voice-room-audio-player';
const VOLUME_KEY = 'voiceRoom.volume';

function loadInitialVolume(): number {
  const raw = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 80;
}

export function useVoiceRoomAudioPlayer(playback: VoiceRoomPlayback | null) {
  const [ready, setReady] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [volume, setVolumeState] = useState(loadInitialVolume);
  const playerRef = useRef<any>(null);
  const pendingPlaybackRef = useRef<VoiceRoomPlayback | null>(null);

  // بيحمّل مقطع التلاوة الحالي وبيظبط موضع التشغيل على نفس اللحظة اللي
  // المفروض تكون وصلتلها كل الأعضاء التانيين دلوقتي (الفرق بين دلوقتي
  // ولحظة بدء التشغيل اللي بعتها السيرفر)، عشان التزامن يفضل تقريبي حتى
  // لو العضو ده دخل الغرفة متأخر عن غيره.
  function loadAndSync(state: VoiceRoomPlayback, muted: boolean) {
    const player = playerRef.current;
    if (!player) {
      pendingPlaybackRef.current = state;
      return;
    }
    const elapsedSeconds = Math.max(0, (Date.now() - state.startedAtMs) / 1000);
    if (muted) player.mute?.();
    else player.unMute?.();
    player.loadVideoById?.({ videoId: state.videoId, startSeconds: elapsedSeconds });
  }

  useEffect(() => {
    function createPlayer() {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player(CONTAINER_ID, {
        height: '1',
        width: '1',
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0 },
        events: {
          onReady: (event: any) => {
            setReady(true);
            event.target.setVolume?.(volume);
            const pending = pendingPlaybackRef.current;
            if (pending) {
              loadAndSync(pending, true);
              setNeedsUnmute(true);
            }
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        createPlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    return () => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // أي تغيير في حالة التشغيل جاي من السيرفر (تلاوة جديدة اتشغّلت، أو عضو
  // جديد دخل ولقى تلاوة شغّالة أصلًا) بيحمّلها هنا. أول تحميل بيبدأ مكتوم
  // دايمًا (سياسة المتصفحات)، وبعدها بيفضل الصوت مكتوم/غير مكتوم حسب آخر
  // اختيار للمستخدم في الجلسة دي.
  const hasUnmutedOnceRef = useRef(false);
  useEffect(() => {
    if (!playback) return;
    if (!ready) {
      pendingPlaybackRef.current = playback;
      return;
    }
    const muted = !hasUnmutedOnceRef.current;
    loadAndSync(playback, muted);
    if (muted) setNeedsUnmute(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.videoId, playback?.startedAtMs, ready]);

  function enableSound() {
    hasUnmutedOnceRef.current = true;
    setNeedsUnmute(false);
    const player = playerRef.current;
    const current = pendingPlaybackRef.current || playback;
    if (player && current) {
      loadAndSync(current, false);
    } else {
      player?.unMute?.();
    }
  }

  function setVolume(value: number) {
    setVolumeState(value);
    localStorage.setItem(VOLUME_KEY, String(value));
    playerRef.current?.setVolume?.(value);
  }

  return { ready, needsUnmute, volume, setVolume, enableSound, containerId: CONTAINER_ID };
}
