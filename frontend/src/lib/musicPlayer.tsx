// حالة مشغّل الصوت مركزية (Context) — بنفس فكرة UndoRedoProvider بالظبط.
//
// ليه لازم Context هنا تحديدًا؟ عشان مشغّل يوتيوب (iframe مخفي) لازم يفضل
// موجود في الـ DOM طول عمر التطبيق، مش بس وهو المستخدم فاتح صفحة "مشغّل
// الصوت". لو المشغّل اتعمله render جوه مكوّن الصفحة نفسها، هيتقفل (unmount)
// فورًا لما المستخدم يتنقّل لصفحة تانية (المهام، الأرشيف...)، وبالتالي
// الصوت هيوقف. هنا بدل كده بننشئ المشغّل مرة واحدة في أعلى شجرة التطبيق
// (main.tsx) وبيفضل شغّال في الخلفية مهما اتنقّل المستخدم بين صفحات
// الموقع — بالظبط زي فكرة الصفحة الأصلية اللي كانت بتسيب الصوت شغال وانت
// بتتنقّل بين مواقع تانية في المتصفح.

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';

export interface YoutubeTrack {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
}

interface MusicPlayerContextValue {
  currentTrack: YoutubeTrack | null;
  playing: boolean;
  looping: boolean;
  playerReady: boolean;
  currentTime: number;
  duration: number;
  playTrack: (track: YoutubeTrack) => void;
  togglePlayPause: () => void;
  toggleLoop: () => void;
  seekToRatio: (ratio: number) => void;
}

const MusicPlayerContext = createContext<MusicPlayerContextValue | null>(null);

// مكتبة يوتيوب IFrame API بتحط API خاص بيها على window مباشرة (مش عن طريق
// import عادي)، فمفيش تعريف نوع رسمي ليها من غير حزمة إضافية — بنكتفي
// بتعريف مبسّط هنا (any) بدل ما نضيف تبعية جديدة للمشروع لمكتبة صغيرة زي دي.
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// بنضمن إن سكريبت الـ IFrame API نفسه يتحمّل مرة واحدة بس لطول عمر
// التطبيق، حتى لو الـ Provider اتعمله re-render أو StrictMode شغّل الـ
// effect مرتين في وضع التطوير.
let apiScriptRequested = false;

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<any>(null);
  const progressTimerRef = useRef<number | null>(null);
  const loopingRef = useRef(false);

  const [playerReady, setPlayerReady] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<YoutubeTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    loopingRef.current = looping;
  }, [looping]);

  function startProgressLoop() {
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== 'function') return;
      if (player.getPlayerState() !== window.YT.PlayerState.PLAYING) return;
      setCurrentTime(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 500);
  }

  useEffect(() => {
    function createPlayer() {
      if (playerRef.current) return;
      playerRef.current = new window.YT.Player('global-yt-audio-player', {
        height: '1',
        width: '1',
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0 },
        events: {
          onReady: () => setPlayerReady(true),
          onStateChange: (event: any) => {
            const State = window.YT.PlayerState;
            if (event.data === State.PLAYING) {
              setPlaying(true);
              startProgressLoop();
              if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            } else if (event.data === State.PAUSED) {
              setPlaying(false);
              if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            } else if (event.data === State.ENDED) {
              if (loopingRef.current) {
                playerRef.current.seekTo(0, true);
                playerRef.current.playVideo();
              } else {
                setPlaying(false);
              }
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
      if (!apiScriptRequested) {
        apiScriptRequested = true;
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playTrack = useCallback(
    (track: YoutubeTrack) => {
      if (!playerRef.current || !playerReady) return;
      setCurrentTrack(track);
      setCurrentTime(0);
      playerRef.current.loadVideoById(track.videoId);
      playerRef.current.playVideo();

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.channel || 'مشغّل الصوت',
          artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '320x180', type: 'image/jpeg' }] : [],
        });
        navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo());
        navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime != null) playerRef.current?.seekTo(details.seekTime, true);
        });
      }
    },
    [playerReady]
  );

  const togglePlayPause = useCallback(() => {
    const player = playerRef.current;
    if (!player || !currentTrack) return;
    if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }, [currentTrack]);

  const toggleLoop = useCallback(() => setLooping((prev) => !prev), []);

  const seekToRatio = useCallback(
    (ratio: number) => {
      const player = playerRef.current;
      if (!player || !currentTrack) return;
      const dur = player.getDuration() || 0;
      player.seekTo(ratio * dur, true);
      setCurrentTime(ratio * dur);
    },
    [currentTrack]
  );

  return (
    <MusicPlayerContext.Provider
      value={{
        currentTrack,
        playing,
        looping,
        playerReady,
        currentTime,
        duration,
        playTrack,
        togglePlayPause,
        toggleLoop,
        seekToRatio,
      }}
    >
      {children}
      {/* حاوية مخفية بصريًا (بكسل واحد) بتفضل موجودة طول عمر التطبيق —
          هنا بيتحمّل مشغّل يوتيوب فعليًا (صوت من غير فيديو ظاهر للمستخدم)،
          فمش بيتقفل لما يتنقّل بين صفحات الموقع. */}
      <div className="yt-audio-player-holder" aria-hidden="true">
        <div id="global-yt-audio-player" />
      </div>
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer(): MusicPlayerContextValue {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error('useMusicPlayer لازم يُستخدم جوه MusicPlayerProvider');
  return ctx;
}
