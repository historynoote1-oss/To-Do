import { useState } from 'react';
import { usePomodoro, PomodoroSettings } from '../lib/pomodoro';
import { DynamicIcon } from '../lib/icons';
import BackButton from './BackButton';

// صفحة "بومودورو": المستخدم هو اللي بيحدد مدة المذاكرة والاستراحة وعدد
// الدورات بالكامل بحرية (من غير ما يتقيّد بمدة معيّنة)، وبيبدأ كل مرحلة
// (مذاكرة/استراحة) بضغطة زرار يدوية بنفسه — مفيش أي عدّ تلقائي بيبدأ لوحده.
// الحالة الفعلية والعدّ التنازلي متمركزين في PomodoroProvider (شوف
// lib/pomodoro.tsx) عشان يفضلوا شغّالين حتى لو المستخدم راح لصفحة تانية.

const FOCUS_PRESETS = [15, 25, 30, 45, 50];
const BREAK_PRESETS = [5, 10, 15];
const LONG_BREAK_PRESETS = [15, 20, 30];
const CYCLE_PRESETS = [2, 3, 4, 6];

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

function SettingField({
  icon,
  label,
  value,
  onChange,
  presets,
  suffix,
  disabled,
}: {
  icon: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  presets: number[];
  suffix: string;
  disabled: boolean;
}) {
  return (
    <div className="pomodoro-setting-field">
      <div className="pomodoro-setting-label">
        <DynamicIcon name={icon} size={15} />
        <span>{label}</span>
      </div>
      <div className="pomodoro-setting-input-row">
        <input
          type="number"
          inputMode="decimal"
          min={1}
          max={360}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <span className="pomodoro-setting-suffix">{suffix}</span>
      </div>
      <div className="pomodoro-setting-presets">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`music-chip ${value === p ? 'active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Pomodoro({
  onBack,
  onOpenMenu,
  menuOpen,
}: {
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const {
    settings,
    updateSettings,
    phase,
    isLongBreak,
    status,
    remainingSeconds,
    totalSeconds,
    focusStreak,
    completedFocusSessions,
    nextPhaseLabel,
    start,
    pause,
    resume,
    reset,
    startNextPhase,
    skip,
  } = usePomodoro();

  const [settingsOpen, setSettingsOpen] = useState(status === 'idle');

  const locked = status === 'running' || status === 'paused';
  const ratio = totalSeconds > 0 ? 1 - remainingSeconds / totalSeconds : 0;
  const circumference = 2 * Math.PI * 90;
  const dashOffset = circumference * (1 - Math.min(1, Math.max(0, ratio)));

  const phaseLabel = phase === 'focus' ? 'مذاكرة وتركيز' : isLongBreak ? 'استراحة طويلة' : 'استراحة';
  const phaseIcon = phase === 'focus' ? 'brain' : 'coffee';

  function patch(key: keyof PomodoroSettings) {
    return (n: number) => updateSettings({ [key]: n });
  }

  return (
    <div className="container view-fade profile-page pomodoro-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>بومودورو</strong>
          <button
            className="icon-btn hamburger-btn"
            onClick={onOpenMenu}
            type="button"
            title="القائمة"
            aria-label="فتح القائمة"
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span className="hamburger-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <p className="music-page-intro">
        حدّد مدة المذاكرة والاستراحة وعدد الدورات زي ما يريحك، وابدأ كل مرحلة بنفسك من غير أي عدّ تلقائي.
      </p>

      {/* ===== الدائرة والعدّاد ===== */}
      <div className={`list-card pomodoro-timer-card phase-${phase} ${isLongBreak ? 'long-break' : ''}`}>
        <div className="pomodoro-phase-row">
          <span className={`pomodoro-phase-badge phase-${phase}`}>
            <DynamicIcon name={phaseIcon} size={14} />
            {phaseLabel}
          </span>
          {status === 'finished' && (
            <span className="pomodoro-finished-badge">
              <DynamicIcon name="check" size={13} />
              خلصت المرحلة
            </span>
          )}
        </div>

        <div className="pomodoro-ring-wrap">
          <svg viewBox="0 0 200 200" className="pomodoro-ring">
            <circle cx="100" cy="100" r="90" className="pomodoro-ring-track" />
            <circle
              cx="100"
              cy="100"
              r="90"
              className={`pomodoro-ring-progress phase-${phase}`}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="pomodoro-ring-center">
            <span className="pomodoro-time">{formatTime(remainingSeconds)}</span>
            <span className="pomodoro-time-sub">
              {status === 'idle' && 'جاهز للبدء'}
              {status === 'running' && 'شغّال دلوقتي'}
              {status === 'paused' && 'متوقّف مؤقتًا'}
              {status === 'finished' && `التالي: ${nextPhaseLabel}`}
            </span>
          </div>
        </div>

        {/* نقاط الدورات — بتوضّح كام دورة مذاكرة خلصت قبل الاستراحة الطويلة الجاية */}
        <div className="pomodoro-dots" aria-hidden="true">
          {Array.from({ length: settings.cyclesUntilLongBreak }).map((_, i) => (
            <span key={i} className={`pomodoro-dot ${i < focusStreak ? 'filled' : ''}`} />
          ))}
        </div>
        <div className="pomodoro-sessions-count">
          <DynamicIcon name="trophy" size={13} />
          {completedFocusSessions} دورة مذاكرة مكتملة
        </div>

        {/* ===== أزرار التحكم — كلها فعل يدوي بحت ===== */}
        <div className="pomodoro-controls">
          {status === 'idle' && (
            <button type="button" className="pomodoro-main-btn" onClick={start}>
              <DynamicIcon name="play" size={18} />
              {phase === 'focus' ? 'ابدأ المذاكرة' : `ابدأ ${isLongBreak ? 'الاستراحة الطويلة' : 'الاستراحة'}`}
            </button>
          )}
          {status === 'running' && (
            <>
              <button type="button" className="pomodoro-main-btn pause" onClick={pause}>
                <DynamicIcon name="pause" size={18} />
                إيقاف مؤقت
              </button>
              <button type="button" className="pomodoro-secondary-btn" onClick={skip}>
                <DynamicIcon name="skip-forward" size={15} />
                تخطّي المرحلة
              </button>
            </>
          )}
          {status === 'paused' && (
            <>
              <button type="button" className="pomodoro-main-btn" onClick={resume}>
                <DynamicIcon name="play" size={18} />
                استكمال
              </button>
              <button type="button" className="pomodoro-secondary-btn" onClick={reset}>
                <DynamicIcon name="rotate-ccw" size={15} />
                إعادة ضبط
              </button>
            </>
          )}
          {status === 'finished' && (
            <button type="button" className="pomodoro-main-btn next-phase" onClick={startNextPhase}>
              <DynamicIcon name="play" size={18} />
              ابدأ {nextPhaseLabel}
            </button>
          )}
        </div>
      </div>

      {/* ===== إعدادات الأوقات — حرية كاملة في تحديد كل مدة ===== */}
      <div className="list-card pomodoro-settings-card">
        <button
          type="button"
          className="pomodoro-settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          <span>
            <DynamicIcon name="settings-2" size={16} />
            إعدادات المدة والدورات
          </span>
          <DynamicIcon name={settingsOpen ? 'chevron-up' : 'chevron-down'} size={16} />
        </button>

        {settingsOpen && (
          <div className="pomodoro-settings-body">
            {locked && (
              <p className="pomodoro-settings-lock-note">
                <DynamicIcon name="lock" size={13} />
                الإعدادات متقفلة أثناء العدّ — اعمل إعادة ضبط لو عايز تغيّرها دلوقتي.
              </p>
            )}
            <SettingField
              icon="brain"
              label="مدة المذاكرة"
              value={settings.focusMinutes}
              onChange={patch('focusMinutes')}
              presets={FOCUS_PRESETS}
              suffix="دقيقة"
              disabled={locked}
            />
            <SettingField
              icon="coffee"
              label="مدة الاستراحة"
              value={settings.breakMinutes}
              onChange={patch('breakMinutes')}
              presets={BREAK_PRESETS}
              suffix="دقيقة"
              disabled={locked}
            />
            <SettingField
              icon="moon-star"
              label="مدة الاستراحة الطويلة"
              value={settings.longBreakMinutes}
              onChange={patch('longBreakMinutes')}
              presets={LONG_BREAK_PRESETS}
              suffix="دقيقة"
              disabled={locked}
            />
            <SettingField
              icon="repeat"
              label="عدد دورات المذاكرة قبل الاستراحة الطويلة"
              value={settings.cyclesUntilLongBreak}
              onChange={patch('cyclesUntilLongBreak')}
              presets={CYCLE_PRESETS}
              suffix="دورة"
              disabled={locked}
            />
          </div>
        )}
      </div>
    </div>
  );
}
