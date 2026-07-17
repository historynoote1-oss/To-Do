// حالة مشغّل الصوت مركزية (Context) — بنفس فكرة UndoRedoProvider بالظبط.
//
// ليه لازم Context هنا تحديدًا؟ عشان مشغّل يوتيوب (iframe مخفي) لازم يفضل
// موجود في الـ DOM طول عمر التطبيق، مش بس وهو المستخدم فاتح صفحة "مشغّل
// القرآن". لو المشغّل اتعمله render جوه مكوّن الصفحة نفسها، هيتقفل (unmount)
// فورًا لما المستخدم يتنقّل لصفحة تانية (المهام، الأرشيف...)، وبالتالي
// الصوت هيوقف. هنا بدل كده بننشئ المشغّل مرة واحدة في أعلى شجرة التطبيق
// (main.tsx) وبيفضل شغّال في الخلفية مهما اتنقّل المستخدم بين صفحات
// الموقع — بالظبط زي فكرة الصفحة الأصلية اللي كانت بتسيب الصوت شغال وانت
// بتتنقّل بين مواقع تانية في المتصفح.
//
// اللوحة دي بقت شاملة: تشغيل/إيقاف، تكرار، تقديم/ترجيع 10 ثواني، تحكم في
// الصوت والكتم، سرعة التشغيل، مؤقّت نوم يوقف الصوت تلقائيًا، مفضّلة، وسجل
// آخر ما تم الاستماع له — كل ده متزامن ومحفوظ محليًا على الجهاز.

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
  volume: number;
  muted: boolean;
  playbackRate: number;
  favorites: YoutubeTrack[];
  recentlyPlayed: YoutubeTrack[];
  sleepMinutes: number | null;
  sleepRemainingSeconds: number | null;
  playTrack: (track: YoutubeTrack) => void;
  togglePlayPause: () => void;
  toggleLoop: () => void;
  seekToRatio: (ratio: number) => void;
  skip: (deltaSeconds: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  toggleFavorite: (track: YoutubeTrack) => void;
  isFavorite: (videoId: string) => boolean;
  setSleepTimer: (minutes: number | null) => void;
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

const FAVORITES_KEY = 'quranPlayer.favorites';
const RECENT_KEY = 'quranPlayer.recentlyPlayed';
const RECENT_LIMIT = 15;

function loadTracksFromStorage(key: string): YoutubeTrack[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTracksToStorage(key: string, tracks: YoutubeTrack[]) {
  try {
    localStorage.setItem(key, JSON.stringify(tracks));
  } catch {
    // تخزين محلي مش متاح (وضع تصفح خاص مثلًا) — نتجاهل بهدوء، الميزة مش
    // أساسية لعمل المشغّل نفسه.
  }
}

// حفظ "حالة التشغيل" الحالية (المقطع الحالي، مكانه، الصوت، الكتم، السرعة،
// التكرار، وهل كان شغّال) — عشان لو المستخدم عمل refresh للصفحة يرجع
// يلاقي نفس المقطع محمّل في نفس المكان تقريبًا بدل ما يبدأ من الصفر.
// ملحوظة: المتصفحات بتمنع التشغيل التلقائي بصوت من غير تفاعل مباشر من
// المستخدم، فبعد الـ refresh هنحمّل المقطع في مكانه الصحيح ومتوقّف، والمستخدم
// بس يضغط تشغيل عشان يكمل (بدل ما يفتكر المقطع والمكان من الأول).
const PLAYER_STATE_KEY = 'quranPlayer.playbackState';

interface PersistedPlayerState {
  track: YoutubeTrack | null;
  currentTime: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  looping: boolean;
  wasPlaying: boolean;
}

const DEFAULT_PLAYER_STATE: PersistedPlayerState = {
  track: null,
  currentTime: 0,
  volume: 100,
  muted: false,
  playbackRate: 1,
  looping: false,
  wasPlaying: false,
};

function isValidTrack(value: unknown): value is YoutubeTrack {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as any).videoId === 'string' &&
    typeof (value as any).title === 'string'
  );
}

function loadPlayerState(): PersistedPlayerState {
  try {
    const raw = localStorage.getItem(PLAYER_STATE_KEY);
    if (!raw) return DEFAULT_PLAYER_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PLAYER_STATE;
    return {
      track: isValidTrack(parsed.track) ? parsed.track : null,
      currentTime: Number.isFinite(Number(parsed.currentTime)) ? Math.max(0, Number(parsed.currentTime)) : 0,
      volume: Number.isFinite(Number(parsed.volume)) ? Math.min(100, Math.max(0, Number(parsed.volume))) : 100,
      muted: !!parsed.muted,
      playbackRate: Number.isFinite(Number(parsed.playbackRate)) && Number(parsed.playbackRate) > 0 ? Number(parsed.playbackRate) : 1,
      looping: !!parsed.looping,
      wasPlaying: !!parsed.wasPlaying,
    };
  } catch {
    return DEFAULT_PLAYER_STATE;
  }
}

function savePlayerState(state: PersistedPlayerState) {
  try {
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
  } catch {
    // نفس منطق التسامح مع غياب التخزين المحلي في باقي الملف.
  }
}

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const initialPlayerState = loadPlayerState();

  const playerRef = useRef<any>(null);
  const progressTimerRef = useRef<number | null>(null);
  const sleepTimerRef = useRef<number | null>(null);
  const sleepEndAtRef = useRef<number | null>(null);
  const loopingRef = useRef(initialPlayerState.looping);
  // بنستخدمهم مرة واحدة بس لحظة ما المشغّل يبقى جاهز، عشان نحمّل المقطع
  // ومكانه ونطبّق الصوت/السرعة قبل ما المستخدم يضغط أي زرار.
  const hasRestoredRef = useRef(false);
  const restoreTrackRef = useRef<YoutubeTrack | null>(initialPlayerState.track);
  const restoreTimeRef = useRef(initialPlayerState.currentTime);

  const [playerReady, setPlayerReady] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<YoutubeTrack | null>(initialPlayerState.track);
  const [playing, setPlaying] = useState(false);
  const [looping, setLooping] = useState(initialPlayerState.looping);
  const [currentTime, setCurrentTime] = useState(initialPlayerState.currentTime);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(initialPlayerState.volume);
  const [muted, setMuted] = useState(initialPlayerState.muted);
  const [playbackRate, setPlaybackRateState] = useState(initialPlayerState.playbackRate);
  const [favorites, setFavorites] = useState<YoutubeTrack[]>(() => loadTracksFromStorage(FAVORITES_KEY));
  const [recentlyPlayed, setRecentlyPlayed] = useState<YoutubeTrack[]>(() => loadTracksFromStorage(RECENT_KEY));
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [sleepRemainingSeconds, setSleepRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    loopingRef.current = looping;
  }, [looping]);

  // أي تغيير في حالة التشغيل (المقطع، مكانه، الصوت، الكتم، السرعة،
  // التكرار، شغّال ولا لأ) بيتخزّن فورًا محليًا.
  useEffect(() => {
    savePlayerState({
      track: currentTrack,
      currentTime,
      volume,
      muted,
      playbackRate,
      looping,
      wasPlaying: playing,
    });
  }, [currentTrack, currentTime, volume, muted, playbackRate, looping, playing]);

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
          onReady: (event: any) => {
            setPlayerReady(true);
            const player = event.target;
            player.setVolume?.(initialPlayerState.volume);
            player.setPlaybackRate?.(initialPlayerState.playbackRate);
            if (initialPlayerState.muted) player.mute?.();
            const track = restoreTrackRef.current;
            if (track && !hasRestoredRef.current) {
              hasRestoredRef.current = true;
              // بنحمّل المقطع في مكانه الصحيح لكن من غير تشغيل تلقائي —
              // المتصفحات بتمنع تشغيل صوت تلقائي من غير تفاعل مباشر من
              // المستخدم، فبنسيبه جاهز ومتوقّف عند نفس اللحظة اللي كان
              // فيها قبل الـ refresh، وبضغطة تشغيل واحدة يكمل من هناك.
              player.cueVideoById({ videoId: track.videoId, startSeconds: restoreTimeRef.current });
              setCurrentTrack(track);
              setCurrentTime(restoreTimeRef.current);
              setDuration(0);
              if ('mediaSession' in navigator) {
                navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo());
                navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo());
                navigator.mediaSession.setActionHandler('seekto', (details: any) => {
                  if (details.seekTime != null) playerRef.current?.seekTo(details.seekTime, true);
                });
                navigator.mediaSession.setActionHandler('seekforward', () => {
                  const p = playerRef.current;
                  if (!p) return;
                  p.seekTo((p.getCurrentTime() || 0) + 10, true);
                });
                navigator.mediaSession.setActionHandler('seekbackward', () => {
                  const p = playerRef.current;
                  if (!p) return;
                  p.seekTo(Math.max(0, (p.getCurrentTime() || 0) - 10), true);
                });
              }
            }
          },
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
            } else if (event.data === State.CUED) {
              // المقطع اتحمّل (زي حالة الاسترجاع بعد الـ refresh) — نجيب
              // مدّته الحقيقية ونحدّث بيانات الميديا في نظام التشغيل.
              const player = playerRef.current;
              const track = restoreTrackRef.current;
              if (player) setDuration(player.getDuration() || 0);
              if (track && 'mediaSession' in navigator) {
                navigator.mediaSession.metadata = new MediaMetadata({
                  title: track.title,
                  artist: track.channel || 'القرآن الكريم',
                  artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '320x180', type: 'image/jpeg' }] : [],
                });
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
      if (sleepTimerRef.current) window.clearInterval(sleepTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToRecentlyPlayed = useCallback((track: YoutubeTrack) => {
    setRecentlyPlayed((prev) => {
      const next = [track, ...prev.filter((t) => t.videoId !== track.videoId)].slice(0, RECENT_LIMIT);
      saveTracksToStorage(RECENT_KEY, next);
      return next;
    });
  }, []);

  const playTrack = useCallback(
    (track: YoutubeTrack) => {
      if (!playerRef.current || !playerReady) return;
      setCurrentTrack(track);
      setCurrentTime(0);
      playerRef.current.loadVideoById(track.videoId);
      playerRef.current.playVideo();
      playerRef.current.setPlaybackRate?.(playbackRate);
      addToRecentlyPlayed(track);

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.channel || 'القرآن الكريم',
          artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: '320x180', type: 'image/jpeg' }] : [],
        });
        navigator.mediaSession.setActionHandler('play', () => playerRef.current?.playVideo());
        navigator.mediaSession.setActionHandler('pause', () => playerRef.current?.pauseVideo());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime != null) playerRef.current?.seekTo(details.seekTime, true);
        });
        navigator.mediaSession.setActionHandler('seekforward', () => {
          const player = playerRef.current;
          if (!player) return;
          player.seekTo((player.getCurrentTime() || 0) + 10, true);
        });
        navigator.mediaSession.setActionHandler('seekbackward', () => {
          const player = playerRef.current;
          if (!player) return;
          player.seekTo(Math.max(0, (player.getCurrentTime() || 0) - 10), true);
        });
      }
    },
    [playerReady, playbackRate, addToRecentlyPlayed]
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

  const skip = useCallback(
    (deltaSeconds: number) => {
      const player = playerRef.current;
      if (!player || !currentTrack) return;
      const dur = player.getDuration() || 0;
      const now = player.getCurrentTime() || 0;
      const target = Math.min(Math.max(now + deltaSeconds, 0), dur || now + deltaSeconds);
      player.seekTo(target, true);
      setCurrentTime(target);
    },
    [currentTrack]
  );

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(value)));
    const player = playerRef.current;
    setVolumeState(clamped);
    if (!player) return;
    player.setVolume?.(clamped);
    if (clamped === 0) {
      setMuted(true);
    } else {
      setMuted(false);
      player.unMute?.();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        player.mute?.();
      } else {
        player.unMute?.();
        player.setVolume?.(volume || 100);
      }
      return next;
    });
  }, [volume]);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    playerRef.current?.setPlaybackRate?.(rate);
  }, []);

  const toggleFavorite = useCallback((track: YoutubeTrack) => {
    setFavorites((prev) => {
      const exists = prev.some((t) => t.videoId === track.videoId);
      const next = exists ? prev.filter((t) => t.videoId !== track.videoId) : [track, ...prev];
      saveTracksToStorage(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((videoId: string) => favorites.some((t) => t.videoId === videoId), [favorites]);

  const setSleepTimer = useCallback((minutes: number | null) => {
    if (sleepTimerRef.current) {
      window.clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (minutes == null) {
      sleepEndAtRef.current = null;
      setSleepMinutes(null);
      setSleepRemainingSeconds(null);
      return;
    }
    sleepEndAtRef.current = Date.now() + minutes * 60_000;
    setSleepMinutes(minutes);
    setSleepRemainingSeconds(minutes * 60);
    sleepTimerRef.current = window.setInterval(() => {
      const endAt = sleepEndAtRef.current;
      if (!endAt) return;
      const remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setSleepRemainingSeconds(remaining);
      if (remaining <= 0) {
        playerRef.current?.pauseVideo?.();
        if (sleepTimerRef.current) window.clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
        sleepEndAtRef.current = null;
        setSleepMinutes(null);
        setSleepRemainingSeconds(null);
      }
    }, 1000);
  }, []);

  return (
    <MusicPlayerContext.Provider
      value={{
        currentTrack,
        playing,
        looping,
        playerReady,
        currentTime,
        duration,
        volume,
        muted,
        playbackRate,
        favorites,
        recentlyPlayed,
        sleepMinutes,
        sleepRemainingSeconds,
        playTrack,
        togglePlayPause,
        toggleLoop,
        seekToRatio,
        skip,
        setVolume,
        toggleMute,
        setPlaybackRate,
        toggleFavorite,
        isFavorite,
        setSleepTimer,
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
