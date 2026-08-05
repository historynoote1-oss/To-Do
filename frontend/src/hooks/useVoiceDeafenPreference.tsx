// ===== تفضيل "فاتح/قافل السماعة" العام =====
// نفس مفتاح localStorage اللي بيستخدمه useVoiceRoomAudioPlayer جوه الغرفة
// نفسها — هنا بنعرضه/نبدّله من *برا* الغرفة كمان (زي أيقونة السماعة اللي
// بتظهر آخر شريط كل روم في قايمة الغرف قبل ما تدخلها).

import { useCallback, useEffect, useState } from 'react';

const DEAFEN_KEY = 'voiceRoom.deafened';
const DEAFEN_EVENT = 'voiceRoom:deafenChanged';

function readDeafened(): boolean {
  return localStorage.getItem(DEAFEN_KEY) === '1';
}

export function useVoiceDeafenPreference() {
  const [deafened, setDeafenedState] = useState(readDeafened);

  useEffect(() => {
    function sync() {
      setDeafenedState(readDeafened());
    }
    window.addEventListener('storage', sync);
    window.addEventListener(DEAFEN_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(DEAFEN_EVENT, sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next = !readDeafened();
    localStorage.setItem(DEAFEN_KEY, next ? '1' : '0');
    window.dispatchEvent(new Event(DEAFEN_EVENT));
  }, []);

  return { deafened, toggle };
}
