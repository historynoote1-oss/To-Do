import { useState, useEffect } from 'react';
import { usePomodoro } from '../lib/pomodoro';
import { DynamicIcon } from '../lib/icons';

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

// شريط ثابت أسفل الشاشة — نفس فكرة MusicPlayerBar بالظبط، لكن لمؤقّت
// البومودورو. بيظهر في أي صفحة في الموقع طول ما فيه مؤقّت شغّال أو متوقّف
// مؤقتًا أو مستني قرار المستخدم بعد ما مرحلة خلصت — عشان المستخدم يفضل
// شايف الوقت المتبقي حتى وهو بيتصفّح صفحات تانية، ويقدر يرجع للصفحة
// الكاملة أو يوقّف/يكمّل من غير ما يحتاج يفتحها.
export default function PomodoroBar({
  onOpenPomodoro,
  isOnPomodoroPage,
}: {
  onOpenPomodoro: () => void;
  isOnPomodoroPage: boolean;
}) {
  const { phase, isLongBreak, status, remainingSeconds, nextPhaseLabel, pause, resume, startNextPhase } = usePomodoro();
  const [dismissed, setDismissed] = useState(false);

  // إعادة الإظهار لما تخلص المرحلة عشان المستخدم يعرف يبدأ التالية
  useEffect(() => {
    if (status === 'finished') setDismissed(false);
  }, [status]);

  if (status === 'idle' || isOnPomodoroPage || dismissed) return null;

  const phaseLabel = phase === 'focus' ? 'مذاكرة' : isLongBreak ? 'استراحة طويلة' : 'استراحة';
  const phaseIcon = phase === 'focus' ? 'brain' : 'coffee';

  return (
    <div className={`pomodoro-bar phase-${phase} status-${status}`} role="region" aria-label="مؤقّت البومودورو">
      <button type="button" className="pomodoro-bar-info" onClick={onOpenPomodoro} aria-label="فتح صفحة البومودورو">
        <span className={`pomodoro-bar-icon phase-${phase}`}>
          <DynamicIcon name={phaseIcon} size={16} />
        </span>
        <span className="pomodoro-bar-text">
          <strong>{status === 'finished' ? `خلصت ${phaseLabel}` : phaseLabel}</strong>
          <span>{status === 'finished' ? `جاهز لبدء ${nextPhaseLabel}` : status === 'paused' ? 'متوقّف مؤقتًا' : 'شغّال دلوقتي'}</span>
        </span>
      </button>

      <span className="pomodoro-bar-time time-mono">{formatTime(remainingSeconds)}</span>

      <div className="pomodoro-bar-controls">
        {status === 'running' && (
          <button type="button" className="icon-btn pomodoro-bar-btn" onClick={pause} aria-label="إيقاف مؤقت" title="إيقاف مؤقت">
            <DynamicIcon name="pause" size={16} />
          </button>
        )}
        {status === 'paused' && (
          <button type="button" className="icon-btn pomodoro-bar-btn" onClick={resume} aria-label="استكمال" title="استكمال">
            <DynamicIcon name="play" size={16} />
          </button>
        )}
        {status === 'finished' && (
          <button
            type="button"
            className="pomodoro-bar-next-btn"
            onClick={startNextPhase}
            aria-label={`ابدأ ${nextPhaseLabel}`}
            title={`ابدأ ${nextPhaseLabel}`}
          >
            <DynamicIcon name="play" size={14} />
            ابدأ {nextPhaseLabel}
          </button>
        )}
        <button
          type="button"
          className="icon-btn pomodoro-bar-btn pomodoro-bar-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="إخفاء الشريط"
          title="إخفاء"
        >
          <DynamicIcon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}
