// ===== الغرف الصوتية — الاتصال الحي (Socket.IO) من جانب الواجهة =====
// الهوك ده بيتفتح مرة واحدة بس لما المستخدم يفتح غرفة صوتية معيّنة (بيتحدد
// بمعرّف roomId)، وبيتقفل تلقائيًا (leave + disconnect) لما يسيب الغرفة أو
// يقفل الصفحة — عشان محدش يفضل "متواجد" في غرفة سابها فعليًا. كل الحالة
// الحيّة (رسائل، أعضاء، تلاوة شغّالة دلوقتي) بتتحدّث هنا من أحداث السيرفر
// مباشرة، مفيش استقصاء (polling) خالص.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL, getToken } from '@/services/api/core';

export interface VoiceRoomMessage {
  id: string;
  userId: string | null;
  username: string;
  isAdmin: boolean;
  body: string;
  isSystem: boolean;
  createdAt: string;
}

export interface VoiceRoomMember {
  userId: string;
  username: string;
  isAdmin: boolean;
  avatarUrl: string | null;
}

export interface VoiceRoomPlayback {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  startedAtMs: number;
  query: string;
}

interface JoinAck {
  error?: string;
  room?: { id: string; name: string };
  messages?: VoiceRoomMessage[];
  members?: VoiceRoomMember[];
  playback?: VoiceRoomPlayback | null;
}

type ConnectionStatus = 'connecting' | 'joined' | 'error' | 'kicked';

export function useVoiceRoomSocket(roomId: string | null) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string>('');
  const [messages, setMessages] = useState<VoiceRoomMessage[]>([]);
  const [members, setMembers] = useState<VoiceRoomMember[]>([]);
  const [playback, setPlayback] = useState<VoiceRoomPlayback | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    setStatus('connecting');
    setErrorMessage(null);
    setMessages([]);
    setMembers([]);
    setPlayback(null);

    const socket = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    function join() {
      socket.emit('voiceRoom:join', roomId, (ack: JoinAck) => {
        if (cancelled) return;
        if (ack.error) {
          setStatus('error');
          setErrorMessage(ack.error);
          return;
        }
        setRoomName(ack.room?.name || '');
        setMessages(ack.messages || []);
        setMembers(ack.members || []);
        setPlayback(ack.playback || null);
        setStatus('joined');
      });
    }

    socket.on('connect', join);

    socket.on('connect_error', () => {
      if (cancelled) return;
      setStatus('error');
      setErrorMessage('تعذّر الاتصال بالغرفة، حاول تاني');
    });

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

    socket.on('voiceRoom:kicked', () => {
      if (cancelled) return;
      setStatus('kicked');
    });

    return () => {
      cancelled = true;
      socket.emit('voiceRoom:leave');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const sendMessage = useCallback((text: string): Promise<{ error?: string }> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        resolve({ error: 'الاتصال بالغرفة اتقطع، حاول تاني' });
        return;
      }
      socket.emit('voiceRoom:message', text, (ack: { error?: string; ok?: boolean } | undefined) => {
        resolve(ack?.error ? { error: ack.error } : {});
      });
    });
  }, []);

  return { status, errorMessage, roomName, messages, members, playback, sendMessage };
}

// ===== معاينة الأعضاء من برا (من غير الانضمام الفعلي) =====
// بيُستخدم في صفحة قايمة الغرف عشان يعرض تحت كل غرفة صورة وأسماء الأعضاء
// المتواجدين فيها فعليًا دلوقتي — بالظبط زي قايمة الأعضاء اللي بتظهر تحت
// أي روم صوتي في ديسكورد من غير ما تدخله. الاشتراك ده لا بيدخّل السوكيت في
// أي غرفة (roomMembers) ولا بيبعت رسالة "فلان دخل الغرفة" — مجرد مراقبة.
export function useVoiceRoomsPreview(roomIds: string[]) {
  const [membersByRoom, setMembersByRoom] = useState<Record<string, VoiceRoomMember[]>>({});
  const key = roomIds.join(',');

  useEffect(() => {
    if (!key) {
      setMembersByRoom({});
      return;
    }
    const ids = key.split(',');
    let cancelled = false;

    const socket = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
    });

    function watch() {
      socket.emit('voiceRoom:watch', ids, (ack: { members?: Record<string, VoiceRoomMember[]>; error?: string }) => {
        if (cancelled || !ack?.members) return;
        setMembersByRoom(ack.members);
      });
    }

    socket.on('connect', watch);
    socket.on('voiceRoom:watchMembers', ({ roomId, members }: { roomId: string; members: VoiceRoomMember[] }) => {
      if (cancelled) return;
      setMembersByRoom((prev) => ({ ...prev, [roomId]: members }));
    });

    return () => {
      cancelled = true;
      socket.emit('voiceRoom:unwatch', ids);
      socket.removeAllListeners();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return membersByRoom;
}
