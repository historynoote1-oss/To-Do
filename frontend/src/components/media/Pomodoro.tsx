import { useState } from 'react';
import { usePomodoro, PomodoroSettings, PomodoroPreset, MAX_PRESETS } from '@/lib/audio/pomodoro';
import { DynamicIcon } from '@/lib/core/icons';
import BackButton from '@/components/layout/BackButton';

// صفحة "بومودورو": المستخدم هو اللي بيحدد مدة المذاكرة والاستراحة وعدد
// الدورات بالكامل بحرية (من غير ما يتقيّد بمدة معيّنة)، وبيبدأ كل مرحلة
// (مذاكرة/استراحة) بضغطة زرار يدوية بنفسه — مفيش أي عدّ تلقائي بيبدأ لوحده.
// الحالة الفعلية والعدّ التنازلي متمركزين في PomodoroProvider (شوف
// lib/pomodoro.tsx) عشان يفضلوا شغّالين حتى لو المستخدم راح لصفحة تانية.
//
// إضافة: "قوالب إعدادات محفوظة" — المستخدم يقدر يحفظ أي تركيبة إعدادات
// (مذاكرة/استراحة/استراحة طويلة/عدد دورات) تحت اسم يختاره، وبعدين يطبّقها
// كاملة بضغطة واحدة من غير ما يعيد كتابة كل رقم من الأول.

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

function formatMinutesLabel(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded}`;
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

// ===== كارت "القوالب المحفوظة" — حفظ/تطبيق/تسمية/حذف بضغطة واحدة =====
function PresetsCard({
  presets,
  activePresetId,
  locked,
  onApply,
  onSave,
  onRename,
  onDelete,
}: {
  presets: PomodoroPreset[];
  activePresetId: string | null;
  locked: boolean;
  onApply: (id: string) => void;
  onSave: (name: string) => boolean;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const atLimit = presets.length >= MAX_PRESETS;

  function openSaveForm() {
    setSaveError(null);
    setNewName('');
    setSaveOpen(true);
  }

  function handleSaveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setSaveError('اكتب اسم للقالب الأول');
      return;
    }
    const ok = onSave(newName);
    if (!ok) {
      setSaveError(atLimit ? `وصلت للحد الأقصى (${MAX_PRESETS} قوالب) — احذف واحد قديم الأول` : 'مقدرناش نحفظ القالب، جرّب تاني');
      return;
    }
    setSaveOpen(false);
    setNewName('');
    setSaveError(null);
  }

  function startRename(p: PomodoroPreset) {
    setConfirmDeleteId(null);
    setRenamingId(p.id);
    setRenameValue(p.name);
  }

  function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renamingId) return;
    if (renameValue.trim()) onRename(renamingId, renameValue);
    setRenamingId(null);
  }

  return (
    <div className="list-card pomodoro-presets-card">
      <div className="pomodoro-presets-header">
        <span>
          <DynamicIcon name="star" size={16} />
          القوالب المحفوظة
        </span>
        <span className="pomodoro-presets-count">
          {presets.length}/{MAX_PRESETS}
        </span>
      </div>

      {presets.length === 0 ? (
        <p className="pomodoro-presets-empty">
          اضبط مدة المذاكرة والاستراحة تحت زي ما يريحك، واحفظها هنا باسم (زي "مذاكرة عميقة" أو "مراجعة سريعة") عشان ترجعلها بضغطة واحدة في أي وقت.
        </p>
      ) : (
        <div className="pomodoro-preset-list">
          {presets.map((p) => (
            <div key={p.id} className={`pomodoro-preset-chip ${activePresetId === p.id ? 'active' : ''}`}>
              {renamingId === p.id ? (
                <form className="pomodoro-preset-rename-form" onSubmit={submitRename}>
                  <input
                    autoFocus
                    value={renameValue}
                    maxLength={30}
                    onChange={(e) => setRenameValue(e.target.value)}
                    aria-label="اسم القالب"
                    onBlur={() => setRenamingId(null)}
                  />
                  <button type="submit" className="icon-btn small" aria-label="حفظ الاسم" title="حفظ الاسم">
                    <DynamicIcon name="check" size={13} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="pomodoro-preset-apply"
                    onClick={() => onApply(p.id)}
                    disabled={locked}
                    title={`مذاكرة ${formatMinutesLabel(p.settings.focusMinutes)} د / استراحة ${formatMinutesLabel(p.settings.breakMinutes)} د`}
                  >
                    {activePresetId === p.id && (
                      <span className="pomodoro-preset-active-dot" aria-hidden="true">
                        <DynamicIcon name="check" size={11} />
                      </span>
                    )}
                    <span className="pomodoro-preset-name">{p.name}</span>
                    <span className="pomodoro-preset-meta">
                      {formatMinutesLabel(p.settings.focusMinutes)}/{formatMinutesLabel(p.settings.breakMinutes)} د
                    </span>
                  </button>

                  {confirmDeleteId === p.id ? (
                    <div className="pomodoro-preset-confirm">
                      <button
                        type="button"
                        className="icon-btn small danger"
                        onClick={() => {
                          onDelete(p.id);
                          setConfirmDeleteId(null);
                        }}
                        aria-label="تأكيد الحذف"
                        title="تأكيد الحذف"
                      >
                        <DynamicIcon name="check" size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn small"
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="إلغاء"
                        title="إلغاء"
                      >
                        <DynamicIcon name="x" size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="pomodoro-preset-actions">
                      <button
                        type="button"
                        className="icon-btn small"
                        onClick={() => startRename(p)}
                        aria-label={`إعادة تسمية ${p.name}`}
                        title="إعادة تسمية"
                        disabled={locked}
                      >
                        <DynamicIcon name="pencil" size={13} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn small"
                        onClick={() => setConfirmDeleteId(p.id)}
                        aria-label={`حذف ${p.name}`}
                        title="حذف"
                        disabled={locked}
                      >
                        <DynamicIcon name="trash" size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pomodoro-preset-save-row">
        {saveOpen ? (
          <form className="pomodoro-preset-save-form" onSubmit={handleSaveSubmit}>
            <input
              autoFocus
              value={newName}
              maxLength={30}
              placeholder="اسم القالب، مثلاً: مذاكرة عميقة"
              onChange={(e) => {
                setNewName(e.target.value);
                if (saveError) setSaveError(null);
              }}
              aria-label="اسم القالب الجديد"
            />
            <button type="submit" className="icon-btn small accent" aria-label="حفظ القالب" title="حفظ القالب">
              <DynamicIcon name="save" size={15} />
            </button>
            <button
              type="button"
              className="icon-btn small"
              onClick={() => {
                setSaveOpen(false);
                setSaveError(null);
              }}
              aria-label="إلغاء"
              title="إلغاء"
            >
              <DynamicIcon name="x" size={15} />
            </button>
          </form>
        ) : (
          <button type="button" className="pomodoro-preset-save-btn" onClick={openSaveForm} disabled={locked || atLimit}>
            <DynamicIcon name="plus" size={14} />
            احفظ الإعدادات الحالية كقالب جديد
          </button>
        )}
        {saveError && <p className="pomodoro-preset-error">{saveError}</p>}
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
    presets,
    activePresetId,
    savePreset,
    applyPreset,
    renamePreset,
    deletePreset,
    phase,
    isLongBreak,
    status,
    remainingSeconds,
    totalSeconds,
    focusStreak,
    completedFocusSessions,
    todayFocusMinutes,
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
      <div className={`list-card pomodoro-timer-card phase-${phase} ${isLongBreak ? 'long-break' : ''} status-${status}`}>
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

        <div className="pomodoro-stats-row">
          <span className="pomodoro-sessions-count">
            <DynamicIcon name="trophy" size={13} />
            {completedFocusSessions} دورة مكتملة
          </span>
          {todayFocusMinutes > 0 && (
            <span className="pomodoro-sessions-count today">
              <DynamicIcon name="zap" size={13} />
              {formatMinutesLabel(todayFocusMinutes)} دقيقة مذاكرة النهاردة
            </span>
          )}
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

      {/* ===== القوالب المحفوظة + الإعدادات — بيتصفّوا جنب بعض في شاشات أوسع ===== */}
      <div className="pomodoro-lower-grid">
        <PresetsCard
          presets={presets}
          activePresetId={activePresetId}
          locked={locked}
          onApply={applyPreset}
          onSave={savePreset}
          onRename={renamePreset}
          onDelete={deletePreset}
        />

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
    </div>
  );
}
