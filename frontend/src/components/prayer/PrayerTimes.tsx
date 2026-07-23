import { useRef, useState } from 'react';
import BackButton from '@/components/layout/BackButton';
import { DynamicIcon } from '@/lib/core/icons';
import { usePrayerTimes } from '@/lib/prayer/prayerTimesStore';
import {
  PRAYER_ORDER,
  PRAYER_LABELS,
  PRAYER_ICONS,
  PrayerKey,
  CALCULATION_METHODS,
  formatCountdown,
  formatClock,
} from '@/lib/prayer/prayerTimes';
import { BUILT_IN_RECITERS, SILENT_RECITER_ID, saveCustomAdhan, deleteCustomAdhan } from '@/lib/audio/adhanAudio';
import { sounds } from '@/lib/audio/sounds';
import { toast } from '@/lib/core/toast';
import PrayerNativePermissions from '@/components/prayer/PrayerNativePermissions';

const REMINDER_PRESETS = [5, 10, 15, 20, 30, 45, 60];

function SectionTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="prayer-section-title">
      <span className="prayer-section-title-main">
        <DynamicIcon name={icon} size={16} />
        {title}
      </span>
      {hint && <span className="prayer-section-hint">{hint}</span>}
    </div>
  );
}

export default function PrayerTimes({
  onBack,
  onOpenMenu,
  menuOpen,
}: {
  onBack: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  const {
    location,
    locating,
    loadingTimes,
    error,
    today,
    nextPrayer,
    currentPrayer,
    settings,
    customAdhans,
    isAzanPlaying,
    azanPlayingLabel,
    detectLocation,
    updateSettings,
    updateReminder,
    refreshCustomAdhans,
    previewReciter,
    stopAzan,
    testAzanNow,
    refresh,
  } = usePrayerTimes();

  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      sounds.error();
      toast.error('لازم تختار ملف صوتي (mp3, m4a, wav...)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      sounds.error();
      toast.error('حجم الملف كبير أوي — اختار ملف أقل من 15 ميجا');
      return;
    }
    setUploading(true);
    try {
      const meta = await saveCustomAdhan(file);
      await refreshCustomAdhans();
      updateSettings({ reciterSelection: meta.id });
      sounds.success();
      toast.success(`"${meta.name}" اتضاف كصوت أذان — واتفعّل دلوقتي`);
    } catch {
      sounds.error();
      toast.error('تعذّر حفظ الملف الصوتي على جهازك');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteCustom(id: string) {
    await deleteCustomAdhan(id);
    await refreshCustomAdhans();
    if (settings.reciterSelection === id) {
      updateSettings({ reciterSelection: BUILT_IN_RECITERS[0].id });
    }
    sounds.click();
    toast.info('اتحذف الملف الصوتي');
  }

  function selectedReciterName(): string {
    if (settings.reciterSelection === SILENT_RECITER_ID) return 'بدون صوت (تنبيه فقط)';
    const builtIn = BUILT_IN_RECITERS.find((r) => r.id === settings.reciterSelection);
    if (builtIn) return builtIn.name;
    const custom = customAdhans.find((c) => c.id === settings.reciterSelection);
    return custom ? custom.name : '—';
  }

  return (
    <div className="container view-fade profile-page prayer-page">
      <div className="top-bar">
        <div className="top-bar-main">
          <BackButton onClick={onBack} />
          <strong>مواقيت الصلاة</strong>
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
        مواقيت دقيقة لصلواتك الخمس حسب موقعك الجغرافي فعليًا، مع أذان تلقائي بصوت القارئ اللي تختاره وتذكيرات قبل كل صلاة بالوقت اللي يناسبك.
      </p>

      {/* ===== البطاقة الرئيسية: الموقع + العدّ التنازلي ===== */}
      <div className="list-card prayer-hero-card">
        {!location ? (
          <div className="prayer-locate-empty">
            <span className="prayer-locate-icon">
              <DynamicIcon name="map-pin" size={26} />
            </span>
            <h3>حدّد موقعك عشان نحسبلك مواقيت دقيقة</h3>
            <p>هناخد إذن الموقع الجغرافي من متصفحك بس، ومش بنشاركه مع حد — بيتخزن على جهازك فقط.</p>
            <button className="prayer-locate-btn" type="button" onClick={detectLocation} disabled={locating}>
              {locating ? (
                <DynamicIcon name="loader" size={16} className="spin" />
              ) : (
                <DynamicIcon name="navigation" size={16} />
              )}
              {locating ? 'جاري تحديد موقعك...' : 'تحديد موقعي الجغرافي'}
            </button>
            {error && <p className="prayer-error-text">{error}</p>}
          </div>
        ) : (
          <>
            <div className="prayer-hero-top">
              <div className="prayer-location-chip">
                <DynamicIcon name="map-pin" size={14} />
                {location.label}
                <button
                  className="prayer-location-refresh"
                  type="button"
                  onClick={detectLocation}
                  disabled={locating}
                  title="تحديث الموقع"
                  aria-label="تحديث الموقع"
                >
                  <DynamicIcon name={locating ? 'loader' : 'refresh-cw'} size={13} className={locating ? 'spin' : ''} />
                </button>
              </div>
              {today && (
                <div className="prayer-date-chip">
                  <DynamicIcon name="calendar-days" size={13} />
                  {today.hijri}
                </div>
              )}
            </div>

            {loadingTimes && !today && (
              <div className="prayer-loading-row">
                <DynamicIcon name="loader" size={18} className="spin" /> جاري حساب مواقيت الصلاة...
              </div>
            )}

            {error && !today && <p className="prayer-error-text">{error}</p>}

            {nextPrayer && (
              <div className="prayer-countdown-block">
                <span className="prayer-countdown-label">
                  <DynamicIcon name={PRAYER_ICONS[nextPrayer.key]} size={15} />
                  الوقت المتبقي لصلاة {PRAYER_LABELS[nextPrayer.key]}
                </span>
                <span className="prayer-countdown-value">{formatCountdown(nextPrayer.remainingMs)}</span>
                <span className="prayer-countdown-time">
                  الساعة {formatClock(nextPrayer.time, settings.is24h)}
                </span>
              </div>
            )}

            {isAzanPlaying && (
              <div className="prayer-azan-banner">
                <span>
                  <DynamicIcon name="radio" size={15} /> {azanPlayingLabel || 'الأذان شغّال الآن'}
                </span>
                <button type="button" onClick={stopAzan}>
                  <DynamicIcon name="x" size={13} /> إيقاف
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== شبكة الصلوات الخمس ===== */}
      {today && (
        <div className="prayer-grid">
          {PRAYER_ORDER.map((key) => {
            const isNext = nextPrayer?.key === key;
            const isCurrent = currentPrayer === key;
            return (
              <div key={key} className={`prayer-card ${isNext ? 'is-next' : ''} ${isCurrent ? 'is-current' : ''}`}>
                <span className="prayer-card-icon">
                  <DynamicIcon name={PRAYER_ICONS[key as PrayerKey]} size={20} />
                </span>
                <span className="prayer-card-name">{PRAYER_LABELS[key as PrayerKey]}</span>
                <span className="prayer-card-time">{formatClock(today.times[key], settings.is24h)}</span>
                {isNext && <span className="prayer-card-badge">الجاية</span>}
                {isCurrent && !isNext && <span className="prayer-card-badge prayer-card-badge-current">دخل وقتها</span>}
              </div>
            );
          })}
        </div>
      )}

      {today && (
        <p className="prayer-sunrise-note">
          <DynamicIcon name="sunrise" size={13} /> الشروق: {formatClock(today.times.sunrise, settings.is24h)}
        </p>
      )}

      {/* ===== اختيار صوت الأذان ===== */}
      <div className="list-card">
        <SectionTitle icon="mic" title="صوت الأذان" hint={selectedReciterName()} />
        <div className="prayer-reciter-grid">
          {BUILT_IN_RECITERS.map((r) => (
            <div key={r.id} className={`prayer-reciter-chip ${settings.reciterSelection === r.id ? 'active' : ''}`}>
              <button type="button" className="prayer-reciter-select" onClick={() => updateSettings({ reciterSelection: r.id })}>
                {settings.reciterSelection === r.id && <DynamicIcon name="check" size={13} />}
                {r.name}
              </button>
              <button
                type="button"
                className="prayer-reciter-preview"
                onClick={() => previewReciter(r.id)}
                title="استماع"
                aria-label={`استماع لصوت ${r.name}`}
              >
                <DynamicIcon name="play" size={12} />
              </button>
            </div>
          ))}

          <div className={`prayer-reciter-chip ${settings.reciterSelection === SILENT_RECITER_ID ? 'active' : ''}`}>
            <button
              type="button"
              className="prayer-reciter-select"
              onClick={() => updateSettings({ reciterSelection: SILENT_RECITER_ID })}
            >
              {settings.reciterSelection === SILENT_RECITER_ID && <DynamicIcon name="check" size={13} />}
              <DynamicIcon name="vibrate" size={13} /> بدون صوت (تنبيه فقط)
            </button>
          </div>

          {customAdhans.map((c) => (
            <div key={c.id} className={`prayer-reciter-chip ${settings.reciterSelection === c.id ? 'active' : ''}`}>
              <button type="button" className="prayer-reciter-select" onClick={() => updateSettings({ reciterSelection: c.id })}>
                {settings.reciterSelection === c.id && <DynamicIcon name="check" size={13} />}
                <DynamicIcon name="upload" size={12} /> {c.name}
              </button>
              <button
                type="button"
                className="prayer-reciter-preview"
                onClick={() => previewReciter(c.id)}
                title="استماع"
                aria-label={`استماع لصوت ${c.name}`}
              >
                <DynamicIcon name="play" size={12} />
              </button>
              <button
                type="button"
                className="prayer-reciter-delete"
                onClick={() => handleDeleteCustom(c.id)}
                title="حذف"
                aria-label={`حذف ${c.name}`}
              >
                <DynamicIcon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={handleUpload}
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          className="prayer-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <DynamicIcon name="loader" size={15} className="spin" /> : <DynamicIcon name="upload" size={15} />}
          {uploading ? 'جاري الحفظ...' : 'ارفع ملف أذان خاص بك'}
        </button>

        <div className="prayer-test-row">
          <button type="button" className="prayer-test-btn" onClick={testAzanNow}>
            <DynamicIcon name="play" size={14} /> تجربة صوت الأذان الآن
          </button>
          {isAzanPlaying && (
            <button type="button" className="prayer-test-btn prayer-test-btn-stop" onClick={stopAzan}>
              <DynamicIcon name="x" size={14} /> إيقاف
            </button>
          )}
        </div>
      </div>

      {/* ===== تذكيرات قبل كل صلاة ===== */}
      <div className="list-card">
        <SectionTitle icon="bell" title="تذكيرات قبل كل صلاة" />
        <div className="prayer-reminders-list">
          {PRAYER_ORDER.map((key) => {
            const r = settings.reminders[key];
            return (
              <div key={key} className="prayer-reminder-row">
                <button
                  type="button"
                  className="prayer-reminder-toggle"
                  aria-pressed={r.enabled}
                  onClick={() => updateReminder(key, { enabled: !r.enabled })}
                >
                  <span className={`side-menu-switch ${r.enabled ? 'on' : ''}`} aria-hidden="true">
                    <span className="side-menu-switch-knob" />
                  </span>
                  <DynamicIcon name={PRAYER_ICONS[key]} size={15} />
                  {PRAYER_LABELS[key]}
                </button>
                {r.enabled && (
                  <select
                    className="prayer-reminder-select"
                    value={r.minutesBefore}
                    onChange={(e) => updateReminder(key, { minutesBefore: Number(e.target.value) })}
                    aria-label={`عدد الدقايق قبل أذان ${PRAYER_LABELS[key]}`}
                  >
                    {REMINDER_PRESETS.map((m) => (
                      <option key={m} value={m}>
                        قبلها بـ {m} دقيقة
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== إعدادات متقدمة ===== */}
      <div className="list-card">
        <button
          type="button"
          className="prayer-settings-toggle"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
        >
          <SectionTitle icon="sliders" title="إعدادات متقدمة" />
          <DynamicIcon name={settingsOpen ? 'chevron-up' : 'chevron-down'} size={16} />
        </button>

        {settingsOpen && (
          <div className="prayer-settings-body">
            <label className="prayer-field">
              <span>طريقة الحساب الفلكي</span>
              <select
                value={settings.method}
                onChange={(e) => updateSettings({ method: Number(e.target.value) })}
              >
                {CALCULATION_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="prayer-field">
              <span>مذهب حساب وقت العصر</span>
              <div className="prayer-segmented">
                <button
                  type="button"
                  className={settings.madhab === 'shafi' ? 'active' : ''}
                  onClick={() => updateSettings({ madhab: 'shafi' })}
                >
                  شافعي / عام
                </button>
                <button
                  type="button"
                  className={settings.madhab === 'hanafi' ? 'active' : ''}
                  onClick={() => updateSettings({ madhab: 'hanafi' })}
                >
                  حنفي
                </button>
              </div>
            </div>

            <button
              type="button"
              className="side-menu-item side-menu-toggle-item prayer-toggle-item"
              onClick={() => updateSettings({ autoPlayEnabled: !settings.autoPlayEnabled })}
              aria-pressed={settings.autoPlayEnabled}
            >
              <DynamicIcon name="radio" size={17} className="side-menu-item-icon" />
              <span className="side-menu-item-label">تشغيل الأذان تلقائيًا في معاده</span>
              <span className={`side-menu-switch ${settings.autoPlayEnabled ? 'on' : ''}`} aria-hidden="true">
                <span className="side-menu-switch-knob" />
              </span>
            </button>

            <button
              type="button"
              className="side-menu-item side-menu-toggle-item prayer-toggle-item"
              onClick={() => {
                const next = !settings.browserNotify;
                if (next && 'Notification' in window && Notification.permission === 'default') {
                  Notification.requestPermission();
                }
                updateSettings({ browserNotify: next });
              }}
              aria-pressed={settings.browserNotify}
            >
              <DynamicIcon name="bell" size={17} className="side-menu-item-icon" />
              <span className="side-menu-item-label">إشعارات المتصفح مع كل أذان وتذكير</span>
              <span className={`side-menu-switch ${settings.browserNotify ? 'on' : ''}`} aria-hidden="true">
                <span className="side-menu-switch-knob" />
              </span>
            </button>

            <button
              type="button"
              className="side-menu-item side-menu-toggle-item prayer-toggle-item"
              onClick={() => updateSettings({ is24h: !settings.is24h })}
              aria-pressed={settings.is24h}
            >
              <DynamicIcon name="hourglass" size={17} className="side-menu-item-icon" />
              <span className="side-menu-item-label">عرض الوقت بنظام 24 ساعة</span>
              <span className={`side-menu-switch ${settings.is24h ? 'on' : ''}`} aria-hidden="true">
                <span className="side-menu-switch-knob" />
              </span>
            </button>

            <label className="prayer-field prayer-volume-field">
              <span>
                <DynamicIcon name="volume-high" size={15} /> مستوى صوت الأذان — {settings.volume}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.volume}
                onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
              />
            </label>

            <p className="prayer-note">
              <DynamicIcon name="info" size={13} /> الأذان بيشتغل تلقائيًا طول ما الموقع مفتوح عندك في المتصفح (تاب شغّال)، ولو كان مشغّل القرآن شغّال وقتها بيتوقف تلقائيًا عشان الأذان يشتغل.
            </p>

            <PrayerNativePermissions />

            <button className="prayer-refresh-btn" type="button" onClick={refresh} disabled={loadingTimes}>
              <DynamicIcon name={loadingTimes ? 'loader' : 'refresh-cw'} size={14} className={loadingTimes ? 'spin' : ''} />
              إعادة حساب المواقيت
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
