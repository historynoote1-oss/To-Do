// ===== جلسة الغرفة الصوتية المركزية (Context) — بنفس فكرة MusicPlayerProvider بالظبط =====
//
// ليه لازم Context هنا تحديدًا؟ لأن أهم متطلب في الغرف الصوتية إن الاتصال
// والصوت (تلاوة القرآن) يفضلوا شغالين طول ما العضو ما عملش "خروج" فعليًا
// — حتى لو راح لصفحة تانية في نفس التطبيق (المهام، مشغّل الموسيقى...)
// أو قفل التاب. لو الـ socket ومشغّل الصوت كانوا جوه مكوّن الصفحة نفسها
// (VoiceRoomView)، كانوا هيتقفلوا (unmount) فورًا لما المستخدم يتنقّل بره
// صفحة الغرف الصوتية، فالاتصال هينقطع والصوت هيوقف — وده عكس المطلوب تمامًا.
//
// الحل: الجلسة دي بتتحمّل مرة واحدة بس في أعلى شجرة التطبيق (main.tsx)
// وبتفضل موجودة طول عمر التطبيق. لما العضو يضغط "انضمام" لغرفة، بننده
// joinRoom(roomId) فيتفتح الاتصال هنا. لما يضغط "خروج" (الزرار الأحمر
// بس، مش زرار الرجوع للقايمة)، بننده leaveRoom() فيتقفل الاتصال فعليًا.
// أي تنقّل تاني بين صفحات الموقع (حتى لو خرج بره صفحة الغرف الصوتية
// خالص) مبيأثرش على الاتصال أو الصوت خالص.

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL, getToken } from '@/services/api/core';
import { uploadVoiceRoomAttachment, type VoiceRoomAttachment } from '@/services/api/voiceRooms';
import { toast } from '@/utils/toast';

export type { VoiceRoomAttachment };

export interface VoiceRoomReaction {
  emoji: string;
  count: number;
  mine: string[];
}

export interface VoiceRoomReplyPreview {
  id: string;
  username: string;
  body: string;
  isSystem: boolean;
  isDeleted: boolean;
}

export interface VoiceRoomMessage {
  id: string;
  userId: string | null;
  username: string;
  isAdmin: boolean;
  body: string;
  isSystem: boolean;
  isPinned?: boolean;
  isDeleted?: boolean;
  mentions?: string[];
  attachment?: VoiceRoomAttachment | null;
  replyTo?: VoiceRoomReplyPreview | null;
  reactions?: VoiceRoomReaction[];
  createdAt: string;
}

export interface VoiceRoomMember {
  userId: string;
  username: string;
  isAdmin: boolean;
  isModerator?: boolean;
  isMuted?: boolean;
  avatarUrl: string | null;
  isBot?: boolean;
}

export interface VoiceRoomPlayback {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  startedAtMs: number;
  query: string;
  paused?: boolean;
  pausedAtMs?: number | null;
  accumulatedPauseMs?: number;
}

export type VoiceRoomControlAction =
  | 'pause'
  | 'resume'
  | 'stop'
  | 'next'
  | 'previous'
  | 'repeat'
  | 'shuffle'
  | 'volume';

export type VoiceRoomRole = 'member' | 'moderator' | 'admin';

interface JoinAck {
  error?: string;
  room?: { id: string; name: string; description?: string | null };
  messages?: VoiceRoomMessage[];
  members?: VoiceRoomMember[];
  playback?: VoiceRoomPlayback | null;
  queue?: VoiceRoomPlayback[];
  repeat?: boolean;
  shuffle?: boolean;
  chatLocked?: boolean;
  sessionStartedAtMs?: number | null;
  myRole?: VoiceRoomRole;
  isMuted?: boolean;
}

type ConnectionStatus = 'idle' | 'connecting' | 'joined' | 'error' | 'kicked';

interface VoiceRoomSessionMeta {
  name: string;
  description?: string | null;
}

interface VoiceRoomSessionContextValue {
  activeRoomId: string | null;
  status: ConnectionStatus;
  errorMessage: string | null;
  roomName: string;
  roomDescription: string | null;
  messages: VoiceRoomMessage[];
  members: VoiceRoomMember[];
  playback: VoiceRoomPlayback | null;
  queue: VoiceRoomPlayback[];
  repeat: boolean;
  shuffle: boolean;
  chatLocked: boolean;
  sessionStartedAtMs: number | null;
  myRole: VoiceRoomRole;
  myMuted: boolean;
  joinRoom: (roomId: string, meta?: VoiceRoomSessionMeta) => void;
  leaveRoom: () => void;
  sendMessage: (text: string, options?: { attachment?: VoiceRoomAttachment | null; replyToId?: string | null }) => Promise<{ error?: string }>;
  uploadAttachment: (file: File) => Promise<{ attachment?: VoiceRoomAttachment; error?: string }>;
  toggleReaction: (messageId: string, emoji: string) => void;
  // لوحة تحكم الأدمن في مشغّل القرآن
  sendControl: (action: VoiceRoomControlAction, value?: number) => Promise<{ error?: string }>;
  // صلاحيات الشات (تثبيت/حذف/مسح/قفل) — للأدمن أو صاحب الرسالة حسب الحالة
  pinMessage: (messageId: string, pinned: boolean) => Promise<{ error?: string }>;
  deleteMessage: (messageId: string) => Promise<{ error?: string }>;
  clearChat: () => Promise<{ error?: string }>;
  toggleChatLock: (locked: boolean) => Promise<{ error?: string }>;
  // مشغّل الصوت المتزامن
  audioReady: boolean;
  needsUnmute: boolean;
  volume: number;
  setVolume: (value: number) => void;
  enableSound: () => void;
  deafened: boolean;
  toggleDeafen: () => void;
}

const VoiceRoomSessionContext = createContext<VoiceRoomSessionContextValue | null>(null);

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const AUDIO_CONTAINER_ID = 'voice-room-session-audio-player';
const VOLUME_KEY = 'voiceRoom.volume';
const DEAFEN_KEY = 'voiceRoom.deafened';
const DEAFEN_EVENT = 'voiceRoom:deafenChanged';

function loadInitialVolume(): number {
  const raw = Number(localStorage.getItem(VOLUME_KEY));
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 80;
}

function loadInitialDeafened(): boolean {
  return localStorage.getItem(DEAFEN_KEY) === '1';
}

let apiScriptRequested = false;

export function VoiceRoomSessionProvider({ children }: { children: ReactNode }) {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState<string | null>(null);
  const [messages, setMessages] = useState<VoiceRoomMessage[]>([]);
  const [members, setMembers] = useState<VoiceRoomMember[]>([]);
  const [playback, setPlayback] = useState<VoiceRoomPlayback | null>(null);
  const [queue, setQueue] = useState<VoiceRoomPlayback[]>([]);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [chatLocked, setChatLocked] = useState(false);
  const [myRole, setMyRole] = useState<VoiceRoomRole>('member');
  const [myMuted, setMyMuted] = useState(false);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fallbackMetaRef = useRef<VoiceRoomSessionMeta | undefined>(undefined);

  // ===== الاتصال الحي بالـ socket — بيتفتح/يتقفل بس مع activeRoomId =====
  useEffect(() => {
    if (!activeRoomId) return;

    let cancelled = false;
    setStatus('connecting');
    setErrorMessage(null);
    setMessages([]);
    setMembers([]);
    setPlayback(null);
    setQueue([]);
    setRepeat(false);
    setShuffle(false);
    setChatLocked(false);
    setMyRole('member');
    setMyMuted(false);
    setSessionStartedAtMs(null);
    setRoomName(fallbackMetaRef.current?.name || '');
    setRoomDescription(fallbackMetaRef.current?.description ?? null);

    const socket = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    function join() {
      socket.emit('voiceRoom:join', activeRoomId, (ack: JoinAck) => {
        if (cancelled) return;
        if (ack.error) {
          setStatus('error');
          setErrorMessage(ack.error);
          return;
        }
        setRoomName(ack.room?.name || fallbackMetaRef.current?.name || '');
        setRoomDescription(ack.room?.description ?? fallbackMetaRef.current?.description ?? null);
        setMessages(ack.messages || []);
        setMembers(ack.members || []);
        setPlayback(ack.playback || null);
        setQueue(ack.queue || []);
        setRepeat(ack.repeat || false);
        setShuffle(ack.shuffle || false);
        setChatLocked(ack.chatLocked || false);
        setMyRole(ack.myRole || 'member');
        setMyMuted(ack.isMuted || false);
        setSessionStartedAtMs(ack.sessionStartedAtMs ?? null);
        setStatus('joined');
      });
    }

    socket.on('connect', join);

    socket.on('connect_error', () => {
      if (cancelled) return;
      setStatus('error');
      setErrorMessage('تعذّر الاتصال بالغرفة، حاول تاني');
    });

    // ===== استمرارية الاتصال لو النت فصل ورجع =====
    // socket.io بيحاول يعيد الاتصال تلقائيًا؛ لما يرجع (event: connect) بننده
    // join() تاني فيرجع العضو للغرفة تلقائيًا من غير ما يضغط دخول تاني.
    socket.io.on('reconnect', join);

    socket.on('voiceRoom:message', (msg: VoiceRoomMessage) => {
      if (cancelled) return;
      setMessages((prev) => [...prev, msg].slice(-200));
    });

    socket.on('voiceRoom:members', (list: VoiceRoomMember[]) => {
      if (cancelled) return;
      setMembers(list);
    });

    socket.on('voiceRoom:playback', (state: VoiceRoomPlayback) => {
      if (cancelled) return;
      setPlayback(state);
    });

    socket.on('voiceRoom:session', (state: { sessionStartedAtMs: number | null }) => {
      if (cancelled) return;
      setSessionStartedAtMs(state.sessionStartedAtMs ?? null);
    });

    socket.on('voiceRoom:kicked', () => {
      if (cancelled) return;
      setStatus('kicked');
      setActiveRoomId(null);
    });

    socket.on(
      'voiceRoom:queue',
      (state: { playback: VoiceRoomPlayback | null; queue: VoiceRoomPlayback[]; repeat: boolean; shuffle: boolean }) => {
        if (cancelled) return;
        setPlayback(state.playback);
        setQueue(state.queue || []);
        setRepeat(state.repeat || false);
        setShuffle(state.shuffle || false);
      },
    );

    socket.on('voiceRoom:messageUpdated', (msg: VoiceRoomMessage) => {
      if (cancelled) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    });

    socket.on('voiceRoom:reactionUpdated', ({ messageId, reactions }: { messageId: string; reactions: VoiceRoomReaction[] }) => {
      if (cancelled) return;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
    });

    socket.on('voiceRoom:mentioned', ({ byUsername }: { messageId: string; byUsername: string }) => {
      if (cancelled) return;
      toast.info(`${byUsername} عمِلك منشن في الشات`);
    });

    socket.on('voiceRoom:chatCleared', () => {
      if (cancelled) return;
      setMessages((prev) => prev.filter((m) => m.isSystem));
    });

    socket.on('voiceRoom:chatLocked', (state: { locked: boolean }) => {
      if (cancelled) return;
      setChatLocked(state.locked);
    });

    socket.on('voiceRoom:permissionsUpdated', (state: { role: VoiceRoomRole; isMuted: boolean }) => {
      if (cancelled) return;
      setMyRole(state.role);
      setMyMuted(state.isMuted);
      if (state.isMuted) toast.info('اتكتمت من الشات في الغرفة دي بمعرفة الأدمن');
    });

    socket.on('voiceRoom:playbackControl', (payload: { action: 'pause' | 'resume' | 'stop' }) => {
      if (cancelled) return;
      const player = playerRef.current;
      if (!player) return;
      if (payload.action === 'pause') player.pauseVideo?.();
      else if (payload.action === 'resume') player.playVideo?.();
      else if (payload.action === 'stop') player.stopVideo?.();
    });

    socket.on('voiceRoom:forceVolume', (payload: { volume: number }) => {
      if (cancelled) return;
      setVolume(payload.volume);
    });

    return () => {
      cancelled = true;
      socket.emit('voiceRoom:leave');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeRoomId]);

  const joinRoom = useCallback((roomId: string, meta?: VoiceRoomSessionMeta) => {
    fallbackMetaRef.current = meta;
    setActiveRoomId(roomId);
  }, []);

  const leaveRoom = useCallback(() => {
    setActiveRoomId(null);
    setStatus('idle');
    setErrorMessage(null);
    setRoomName('');
    setRoomDescription(null);
    setMessages([]);
    setMembers([]);
    setPlayback(null);
    setQueue([]);
    setRepeat(false);
    setShuffle(false);
    setChatLocked(false);
    setMyRole('member');
    setMyMuted(false);
    setSessionStartedAtMs(null);
  }, []);

  const activeRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  const sendMessage = useCallback(
    (text: string, options?: { attachment?: VoiceRoomAttachment | null; replyToId?: string | null }): Promise<{ error?: string }> => {
      return new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          resolve({ error: 'الاتصال بالغرفة اتقطع، حاول تاني' });
          return;
        }
        const body = { body: text, attachment: options?.attachment || null, replyToId: options?.replyToId || null };
        socket.emit('voiceRoom:message', body, (ack: { error?: string; ok?: boolean } | undefined) => {
          resolve(ack?.error ? { error: ack.error } : {});
        });
      });
    },
    [],
  );

  const uploadAttachment = useCallback(async (file: File): Promise<{ attachment?: VoiceRoomAttachment; error?: string }> => {
    const roomId = activeRoomIdRef.current;
    if (!roomId) return { error: 'لسه مادخلتش أي غرفة' };
    try {
      const attachment = await uploadVoiceRoomAttachment(roomId, file);
      return { attachment };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'تعذّر رفع الملف، حاول تاني' };
    }
  }, []);

  const toggleReaction = useCallback((messageId: string, emoji: string) => {
    socketRef.current?.emit('voiceRoom:reaction', { messageId, emoji });
  }, []);

  function emitAck<T extends Record<string, unknown>>(event: string, payload: T): Promise<{ error?: string }> {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        resolve({ error: 'الاتصال بالغرفة اتقطع، حاول تاني' });
        return;
      }
      socket.emit(event, payload, (ack: { error?: string; ok?: boolean } | undefined) => {
        resolve(ack?.error ? { error: ack.error } : {});
      });
    });
  }

  const sendControl = useCallback(
    (action: VoiceRoomControlAction, value?: number) => emitAck('voiceRoom:control', { action, value }),
    [],
  );
  const pinMessage = useCallback(
    (messageId: string, pinned: boolean) => emitAck('voiceRoom:pinMessage', { messageId, pinned }),
    [],
  );
  const deleteMessage = useCallback((messageId: string) => emitAck('voiceRoom:deleteMessage', { messageId }), []);
  const clearChat = useCallback(() => emitAck('voiceRoom:clearChat', {}), []);
  const toggleChatLock = useCallback((locked: boolean) => emitAck('voiceRoom:toggleChatLock', { locked }), []);

  // ===== مشغّل الصوت المتزامن (نفس منطق useVoiceRoomAudioPlayer، بس دلوقتي
  // مرتبط بعمر الـ Provider نفسه مش بعمر شاشة المكالمة) =====
  const [audioReady, setAudioReady] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [volume, setVolumeState] = useState(loadInitialVolume);
  const [deafened, setDeafened] = useState(loadInitialDeafened);
  const playerRef = useRef<any>(null);
  const pendingPlaybackRef = useRef<VoiceRoomPlayback | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const hasUnmutedOnceRef = useRef(false);

  function loadAndSync(state: VoiceRoomPlayback, muted: boolean) {
    const player = playerRef.current;
    currentVideoIdRef.current = state.videoId;
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
      playerRef.current = new window.YT.Player(AUDIO_CONTAINER_ID, {
        height: '1',
        width: '1',
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0 },
        events: {
          onReady: (event: any) => {
            setAudioReady(true);
            event.target.setVolume?.(volume);
            const pending = pendingPlaybackRef.current;
            if (pending) {
              loadAndSync(pending, true);
              setNeedsUnmute(true);
            }
          },
          onStateChange: (event: any) => {
            // 0 = ENDED — بنبلّغ السيرفر عشان يشغّل التالي في الطابور تلقائي
            // (لو فيه حاجة تانية) عند كل الأعضاء في نفس اللحظة.
            if (event.data === 0) {
              const socket = socketRef.current;
              const videoId = event.target?.getVideoData?.()?.video_id || currentVideoIdRef.current;
              if (socket && socket.connected && videoId) {
                socket.emit('voiceRoom:trackEnded', { videoId });
              }
            }
          },
        },
      });
    }

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else if (!apiScriptRequested) {
      apiScriptRequested = true;
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        createPlayer();
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    } else {
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        createPlayer();
      };
    }
    // بنعمل الـ player مرة واحدة بس طول عمر التطبيق — مش بيتقفل خالص حتى
    // لو العضو خرج من الغرفة، عشان يفضل جاهز للمرة الجاية من غير تأخير.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function sync() {
      const next = localStorage.getItem(DEAFEN_KEY) === '1';
      setDeafened(next);
      const player = playerRef.current;
      if (next) player?.mute?.();
      else if (hasUnmutedOnceRef.current) player?.unMute?.();
    }
    window.addEventListener('storage', sync);
    window.addEventListener(DEAFEN_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(DEAFEN_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    if (!playback) {
      pendingPlaybackRef.current = null;
      return;
    }
    if (!audioReady) {
      pendingPlaybackRef.current = playback;
      return;
    }
    const muted = deafened || !hasUnmutedOnceRef.current;
    loadAndSync(playback, muted);
    if (playback.paused) {
      // العضو الجديد (أو الرجعة من إعادة اتصال) لازم ياخد حالة "موقوف"
      // برضه، مش يبدأ يشغّل تلقائي وهو الأدمن واقفها لكل الناس.
      setTimeout(() => playerRef.current?.pauseVideo?.(), 300);
    }
    if (!deafened && !hasUnmutedOnceRef.current) setNeedsUnmute(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback?.videoId, playback?.startedAtMs, audioReady]);

  // العضو لو خرج من الغرفة فعليًا (leaveRoom) لازم الصوت يوقف فورًا حتى لو
  // مفيش playback جديد وصل بعد.
  useEffect(() => {
    if (!activeRoomId) {
      playerRef.current?.stopVideo?.();
    }
  }, [activeRoomId]);

  function enableSound() {
    hasUnmutedOnceRef.current = true;
    setNeedsUnmute(false);
    const player = playerRef.current;
    const current = pendingPlaybackRef.current || playback;
    if (player && current) {
      loadAndSync(current, deafened);
    } else if (!deafened) {
      player?.unMute?.();
    }
  }

  function toggleDeafen() {
    hasUnmutedOnceRef.current = true;
    setNeedsUnmute(false);
    setDeafened((prev) => {
      const next = !prev;
      localStorage.setItem(DEAFEN_KEY, next ? '1' : '0');
      window.dispatchEvent(new Event(DEAFEN_EVENT));
      const player = playerRef.current;
      if (next) player?.mute?.();
      else player?.unMute?.();
      return next;
    });
  }

  function setVolume(value: number) {
    setVolumeState(value);
    localStorage.setItem(VOLUME_KEY, String(value));
    playerRef.current?.setVolume?.(value);
  }

  return (
    <VoiceRoomSessionContext.Provider
      value={{
        activeRoomId,
        status,
        errorMessage,
        roomName,
        roomDescription,
        messages,
        members,
        playback,
        queue,
        repeat,
        shuffle,
        chatLocked,
        sessionStartedAtMs,
        myRole,
        myMuted,
        joinRoom,
        leaveRoom,
        sendMessage,
        uploadAttachment,
        toggleReaction,
        sendControl,
        pinMessage,
        deleteMessage,
        clearChat,
        toggleChatLock,
        audioReady,
        needsUnmute,
        volume,
        setVolume,
        enableSound,
        deafened,
        toggleDeafen,
      }}
    >
      {children}
      {/* حاوية مخفية بصريًا بتفضل موجودة طول عمر التطبيق — هنا بيتحمّل مشغّل
          الصوت الفعلي (تلاوة القرآن)، فمش بيتأثر خالص بالتنقّل بين صفحات
          الموقع ولا بقفل شاشة الغرفة الصوتية. */}
      <div className="yt-audio-player-holder" aria-hidden="true">
        <div id={AUDIO_CONTAINER_ID} />
      </div>
    </VoiceRoomSessionContext.Provider>
  );
}

export function useVoiceRoomSession(): VoiceRoomSessionContextValue {
  const ctx = useContext(VoiceRoomSessionContext);
  if (!ctx) throw new Error('useVoiceRoomSession لازم يُستخدم جوه VoiceRoomSessionProvider');
  return ctx;
}

// ===== معاينة الأعضاء من برا (من غير الانضمام الفعلي) — لسه بتفتح
// اتصال socket خفيف منفصل بتاعها، مش مرتبطة بجلسة الغرفة النشطة. =====
export function useVoiceRoomsPreview(roomIds: string[]) {
  const [membersByRoom, setMembersByRoom] = useState<Record<string, VoiceRoomMember[]>>({});
  const [sessionsByRoom, setSessionsByRoom] = useState<Record<string, number | null>>({});
  const key = roomIds.join(',');

  useEffect(() => {
    if (!key) {
      setMembersByRoom({});
      setSessionsByRoom({});
      return;
    }
    const ids = key.split(',');
    let cancelled = false;

    const socket = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
    });

    function watch() {
      socket.emit(
        'voiceRoom:watch',
        ids,
        (ack: { members?: Record<string, VoiceRoomMember[]>; sessions?: Record<string, number | null>; error?: string }) => {
          if (cancelled || !ack?.members) return;
          setMembersByRoom(ack.members);
          setSessionsByRoom(ack.sessions || {});
        },
      );
    }

    socket.on('connect', watch);
    socket.on(
      'voiceRoom:watchMembers',
      ({ roomId, members, sessionStartedAtMs }: { roomId: string; members: VoiceRoomMember[]; sessionStartedAtMs?: number | null }) => {
        if (cancelled) return;
        setMembersByRoom((prev) => ({ ...prev, [roomId]: members }));
        setSessionsByRoom((prev) => ({ ...prev, [roomId]: sessionStartedAtMs ?? null }));
      },
    );

    return () => {
      cancelled = true;
      socket.emit('voiceRoom:unwatch', ids);
      socket.removeAllListeners();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { membersByRoom, sessionsByRoom };
}
