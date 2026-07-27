// ===== عدّاد "الغرفة شغالة من قد إيه" =====
// بيظهر بس لو فيه عضو واحد على الأقل متواجد في الغرفة دلوقتي (sessionStartedAtMs
// جاي من السيرفر، مش محلي)، وبيعد تلقائيًا كل ثانية من غير أي طلب شبكة.
// أول ما الغرفة تفضى بيختفي تمامًا، ولو رجع حد يدخل بيبدأ العدّ من الأول.

import { useEffect, useState } from 'react';
import { DynamicIcon } from '@/utils/icons';

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}ي ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function RoomDurationTimer({
  startedAtMs,
  size = 'sm',
}: {
  startedAtMs: number | null;
  size?: 'sm' | 'md';
}) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!startedAtMs) return;
    const id = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [startedAtMs]);

  if (!startedAtMs) return null;

  return (
    <span className={`voice-room-duration voice-room-duration-${size}`} title="مدة استمرار الغرفة">
      <DynamicIcon name="timer" size={size === 'md' ? 13 : 11} />
      {formatElapsed(Date.now() - startedAtMs)}
    </span>
  );
}
